// End-of-call pipeline: Vaani webhook → Gemini → Nikhil's rubric → Neon →
// HubSpot + Resend. Idempotent on call_id (Vaani may retry webhooks).
// WhatsApp / web form could call processCall() with their own normaliser later.
import { query, one, logEvent } from './db.js';
import { analyseCall } from './gemini.js';
import { applyBackstops, classify, agentQuotedPrice, isAfterHours, normPhone } from './rules.js';
import { sendHandoff, sendEscalation } from './notify.js';
import { createDeal } from './hubspot.js';
import { fetchCallInfo } from './vaani.js';

// ---------- 1. normalise ----------
const pick = (obj, paths) => {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const AGENT_ROLES = /^(assistant|agent|bot|ai|vaani|system_agent|model)$/i;

export function transcriptToText(t) {
  if (!t) return '';
  if (typeof t === 'string') {
    // Vaani: "[13:33:14] AGENT: ...\n\n[13:33:19] USER: ..." → "Agent: ..." / "Caller: ..."
    return t
      .split('\n')
      .map((l) => l.replace(/^\s*\[[\d:.\s]+\]\s*/, '').replace(/^\s*(AGENT|ASSISTANT|BOT)\s*:/i, 'Agent:').replace(/^\s*(USER|CUSTOMER|CALLER|HUMAN)\s*:/i, 'Caller:'))
      .filter((l) => l.trim())
      .join('\n')
      .trim();
  }
  if (Array.isArray(t)) {
    return t
      .map((m) => {
        if (typeof m === 'string') return m;
        const role = m.role ?? m.speaker ?? m.from ?? m.type ?? '';
        const text = m.content ?? m.text ?? m.message ?? m.transcript ?? '';
        if (!text) return null;
        return `${AGENT_ROLES.test(role) ? 'Agent' : 'Caller'}: ${`${text}`.trim()}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof t === 'object') return transcriptToText(t.messages ?? t.turns ?? t.text ?? '');
  return '';
}

/** Tolerant of field names. Vaani (docs.vaanivoice.ai) sends event "call_postprocessing" with
 *  { call_id, timestamp, data: { call_duration (ms), transcript, summary, entities, recording_url } }. */
export function normalizePayload(raw) {
  const r = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? { ...raw, ...raw.data } : raw ?? {};
  const callId = pick(r, ['call_id', 'room_name', 'callId', 'call.id', 'call_sid', 'callSid', 'id', 'session_id', 'conversation_id']);
  const phone = pick(r, ['from', 'from_number', 'call_metadata.phone', 'caller', 'caller_number', 'caller_phone', 'customer_number', 'customer.number', 'customer.phone', 'call.from', 'phone', 'phone_number']);
  const transcript = transcriptToText(pick(r, ['transcript', 'transcript_object', 'messages', 'conversation', 'call.transcript', 'call.messages', 'artifact.transcript', 'artifact.messages']));
  const event = pick(raw ?? {}, ['event', 'type', 'event_type']) ?? pick(r, ['status']);
  let duration = Number(pick(r, ['duration_sec', 'duration_seconds', 'duration', 'call_duration', 'call.duration', 'durationSeconds', 'duration_ms']) ?? 0);
  // Vaani's live payloads send seconds (175.77); its docs show milliseconds. Treat huge values as ms.
  if (r.duration_ms != null || duration > 36000) duration = duration / 1000;
  const s0 = Date.parse(r.call_started_at ?? r.picked_up_at ?? ''), s1 = Date.parse(r.call_ended_at ?? '');
  if (Number.isFinite(s0) && Number.isFinite(s1) && s1 > s0) duration = (s1 - s0) / 1000;
  const startedRaw = pick(r, ['call_started_at', 'picked_up_at', 'started_at', 'start_time', 'startedAt', 'call.started_at', 'created_at', 'timestamp']);
  const started = startedRaw ? new Date(typeof startedRaw === 'number' && startedRaw < 1e12 ? startedRaw * 1000 : startedRaw) : new Date();
  const costInr = pick(r, ['cost_inr', 'call_cost_inr', 'cost.inr']);
  const costUsd = pick(r, ['cost_usd', 'cost.usd']);
  const costAny = pick(r, ['cost', 'call_cost', 'total_cost', 'price']);
  const currency = `${pick(r, ['currency', 'cost_currency']) ?? 'INR'}`.toUpperCase();

  return {
    callId: `${callId ?? `call_${started.getTime()}_${normPhone(phone) ?? 'unknown'}`}`,
    phone: normPhone(phone),
    transcript,
    durationSec: Number.isFinite(duration) ? Math.round(duration) : 0,
    startedAt: Number.isNaN(started.getTime()) ? new Date() : started,
    vendorCostInr:
      costInr != null ? Number(costInr)
      : costUsd != null ? Number(costUsd) * Number(process.env.USD_INR ?? 88)
      : typeof costAny === 'number' || /^[\d.]+$/.test(`${costAny ?? ''}`) ? Number(costAny) * (currency === 'USD' ? Number(process.env.USD_INR ?? 88) : 1)
      : null,
    event,
    entities: r.entities ?? null,
    vendorSummary: r.summary ?? null,
    recordingUrl: r.recording_url ?? null,
  };
}

// ---------- 2. caller context ----------
export async function lookupCaller(phone) {
  const p = normPhone(phone);
  if (!p) return { known: false, existing_client: false, previous_calls: 0 };
  const client = await one('select name, project, designer, notes from clients where phone = $1', [p]);
  const prev = await query(
    `select call_id, started_at, classification, caller_name, summary, booking
       from calls where caller_phone = $1 order by started_at desc limit 5`, [p]);
  return {
    known: Boolean(client) || prev.length > 0,
    existing_client: Boolean(client),
    client,
    previous_calls: prev.length,
    last_call: prev[0] ? { at: prev[0].started_at, classification: prev[0].classification, summary: prev[0].summary, booking: prev[0].booking } : null,
    name: client?.name ?? prev.find((c) => c.caller_name)?.caller_name ?? null,
  };
}

// ---------- cost ----------
export function voiceCostInr(n) {
  if (n.vendorCostInr != null && Number.isFinite(n.vendorCostInr)) return n.vendorCostInr;
  return Math.ceil((n.durationSec || 0) / 60) * Number(process.env.VAANI_COST_PER_MIN_INR ?? 6);
}

// ---------- 3–7. process ----------
export async function processCall(raw, { force = false } = {}) {
  const n = normalizePayload(raw);
  const existing = await one('select * from calls where call_id = $1', [n.callId]);
  if (existing?.classification && !force) return { ...existing, deduped: true };

  // Vaani's post-call payload has no caller number / cost: recover them.
  if (!n.phone) {
    const start = await one(`select caller_phone from events where type = 'vaani_start' and call_id = $1 and caller_phone is not null limit 1`, [n.callId]);
    if (start) n.phone = start.caller_phone;
  }
  if (!n.phone || n.vendorCostInr == null) {
    try {
      const info = await fetchCallInfo(n.callId);
      if (info) {
        n.phone ||= normPhone(info.phone);
        if (n.vendorCostInr == null && info.cost != null) n.vendorCostInr = info.cost;
        if (info.startedAt && !raw?.started_at) n.startedAt = new Date(info.startedAt);
      }
    } catch (err) {
      await logEvent('error', { callId: n.callId, detail: { stage: 'vaani-lookup', message: err.message } });
    }
  }

  const ctx = await lookupCaller(n.phone);

  // Gemini (skipped for empty / dropped calls)
  let analysis = null, usage = { in: 0, out: 0 }, costAi = 0, model = null, aiError = null;
  // Skip the model when the caller barely spoke (dropped / silent call).
  const callerText = n.transcript.split('\n').filter((l) => !/^\s*agent\s*:/i.test(l)).join(' ').replace(/^\s*caller\s*:/gim, '');
  if (callerText.replace(/\s+/g, ' ').trim().length >= 40) {
    try {
      const r = await analyseCall(n.transcript, ctx);
      analysis = applyBackstops(r.analysis);
      usage = r.usage; costAi = r.costInr; model = r.model;
    } catch (err) {
      aiError = err.message;
      await logEvent('error', { callId: n.callId, phone: n.phone, detail: { stage: 'gemini', message: err.message } });
    }
  }

  let cls;
  if (analysis) cls = classify(analysis, n.transcript);
  else if (aiError) cls = { classification: 'incomplete', reason: 'AI analysis failed — front desk to review transcript', flags: ['AI error'] };
  else cls = classify({}, '');

  const priceQuoted = Boolean(analysis?.price_quoted_by_agent) || agentQuotedPrice(n.transcript);
  if (priceQuoted) cls.flags = [...(cls.flags ?? []), 'COMPLIANCE: agent may have mentioned a price — review'];

  // Booking made during the call by the book_consultation tool.
  const bookingEvt = await one(
    `select detail from events where type = 'booking'
        and (call_id = $1 or (caller_phone = $2 and created_at > now() - interval '3 hours'))
      order by created_at desc limit 1`, [n.callId, n.phone]);
  let booking = bookingEvt?.detail ?? null;
  // Tool calls may arrive without call id / phone: match on the email or name given on the call.
  if (!booking && (analysis?.caller_email || analysis?.caller_name)) {
    const m = await one(
      `select detail from events where type = 'booking' and created_at > now() - interval '2 hours'
          and (lower(detail->>'email') = lower($1) or lower(detail->>'name') = lower($2))
        order by created_at desc limit 1`, [analysis.caller_email ?? '', analysis.caller_name ?? '']);
    booking = m?.detail ?? null;
  }

  const p = analysis?.project ?? {};
  const record = {
    call_id: n.callId,
    caller_phone: n.phone ?? normPhone(analysis?.caller_phone) ?? null,
    caller_name: analysis?.caller_name ?? ctx.name ?? null,
    started_at: n.startedAt.toISOString(),
    duration_sec: n.durationSec,
    after_hours: isAfterHours(n.startedAt),
    returning_caller: ctx.previous_calls > 0,
    transcript: n.transcript,
    classification: cls.classification,
    reason: cls.reason,
    summary: analysis?.summary ?? (n.transcript ? null : 'No conversation captured (missed or dropped call).'),
    criteria: analysis?.criteria ?? null,
    project: analysis ? { ...p, caller_email: analysis.caller_email, language: analysis.language, sentiment: analysis.sentiment, open_questions: analysis.open_questions_for_designer, existing_client: analysis.existing_client } : null,
    flags: cls.flags ?? [],
    pricing_asked: Boolean(analysis?.pricing_asked),
    price_quoted: priceQuoted,
    booking,
    cost_voice_inr: voiceCostInr(n),
    cost_ai_inr: costAi,
    ai_tokens_in: usage.in,
    ai_tokens_out: usage.out,
    ai_model: model,
    raw: raw ?? null,
  };

  const saved = await one(
    `insert into calls (call_id, caller_phone, caller_name, started_at, duration_sec, after_hours, returning_caller, transcript,
        classification, reason, summary, criteria, project, flags, pricing_asked, price_quoted, booking,
        cost_voice_inr, cost_ai_inr, ai_tokens_in, ai_tokens_out, ai_model, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     on conflict (call_id) do update set
        caller_phone = excluded.caller_phone, caller_name = excluded.caller_name, started_at = excluded.started_at,
        duration_sec = excluded.duration_sec, after_hours = excluded.after_hours, returning_caller = excluded.returning_caller,
        transcript = excluded.transcript, classification = excluded.classification, reason = excluded.reason,
        summary = excluded.summary, criteria = excluded.criteria, project = excluded.project, flags = excluded.flags,
        pricing_asked = excluded.pricing_asked, price_quoted = excluded.price_quoted, booking = excluded.booking,
        cost_voice_inr = excluded.cost_voice_inr, cost_ai_inr = excluded.cost_ai_inr, ai_tokens_in = excluded.ai_tokens_in,
        ai_tokens_out = excluded.ai_tokens_out, ai_model = excluded.ai_model, raw = excluded.raw, updated_at = now()
     returning *`,
    [record.call_id, record.caller_phone, record.caller_name, record.started_at, record.duration_sec, record.after_hours,
      record.returning_caller, record.transcript, record.classification, record.reason, record.summary,
      json(record.criteria), json(record.project), json(record.flags), record.pricing_asked, record.price_quoted,
      json(record.booking), record.cost_voice_inr, record.cost_ai_inr, record.ai_tokens_in, record.ai_tokens_out,
      record.ai_model, json(record.raw)]
  );

  // ---------- outputs ----------
  const view = {
    ...record,
    caller_email: analysis?.caller_email,
    language: analysis?.language,
    sentiment: analysis?.sentiment,
    open_questions: analysis?.open_questions_for_designer ?? [],
    existing_client: analysis?.existing_client,
    client: ctx.client,
  };
  const updates = {};

  if (record.classification === 'qualified') {
    try {
      const dealId = await createDeal(view);
      if (dealId) { updates.hubspot_deal_id = dealId; await logEvent('hubspot', { callId: n.callId, phone: n.phone, detail: { dealId } }); }
    } catch (err) {
      await logEvent('error', { callId: n.callId, phone: n.phone, detail: { stage: 'hubspot', message: err.message } });
    }
    if (!existing?.handoff_sent) {
      try {
        const id = await sendHandoff(view);
        updates.handoff_sent = true;
        await logEvent('handoff', { callId: n.callId, phone: n.phone, detail: { emailId: id, to: process.env.HANDOFF_EMAIL } });
      } catch (err) {
        await logEvent('error', { callId: n.callId, phone: n.phone, detail: { stage: 'handoff', message: err.message } });
      }
    }
  }

  if (record.classification === 'existing_client' && !existing?.escalation_sent) {
    try {
      const id = await sendEscalation(view);
      updates.escalation_sent = true;
      await logEvent('escalation', { callId: n.callId, phone: n.phone, detail: { emailId: id, to: process.env.ESCALATION_EMAIL } });
    } catch (err) {
      await logEvent('error', { callId: n.callId, phone: n.phone, detail: { stage: 'escalation', message: err.message } });
    }
  }

  if (Object.keys(updates).length) {
    const cols = Object.keys(updates);
    await query(
      `update calls set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() where call_id = $1`,
      [n.callId, ...cols.map((c) => updates[c])]
    );
  }

  return { ...saved, ...updates, ai_error: aiError };
}

function json(v) {
  return v === null || v === undefined ? null : JSON.stringify(v);
}
