// Designer handoff + urgent escalation emails via Resend.
// Why email over Telegram: designers already live in email, the note is long
// and structured, it's searchable/forwardable and sits next to the calendar invite.
import { CRITERIA, CRITERIA_LABELS, formatIST } from './rules.js';

const esc = (s) => `${s ?? ''}`.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  if (!to) throw new Error('No recipient (set HANDOFF_EMAIL / ESCALATION_EMAIL)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Aangan Studio <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      subject, html, text,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.id;
}

function row(label, value) {
  return `<tr><td style="padding:6px 10px;color:#5b6f66;width:170px;vertical-align:top;border-bottom:1px solid #e6eee9">${esc(label)}</td><td style="padding:6px 10px;border-bottom:1px solid #e6eee9">${esc(dash(value))}</td></tr>`;
}

const wrap = (inner) => `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#163a2f;max-width:640px;margin:0 auto;font-size:14px;line-height:1.45">${inner}<p style="color:#8a9a92;font-size:12px;margin-top:24px">Sent automatically by the Aangan phone agent · No price was or should be quoted before the consultation.</p></div>`;

export function handoffEmail(call) {
  const p = call.project ?? {};
  const b = call.booking;
  const name = call.caller_name || 'Caller';
  const when = b?.start ? `${b.spoken ?? formatIST(b.start)}${b.status === 'requested' ? ' (requested — please confirm)' : ''}` : 'Not booked on the call — please call back to book';
  const subject = `New qualified lead: ${name} · ${dash(p.subtype)} · ${dash(p.location)}${b?.start ? ` · consult ${formatIST(b.start)}` : ''}`;

  const crit = CRITERIA.map((c) => {
    const s = call.criteria?.[c]?.status ?? 'unclear';
    const icon = s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⚠️';
    return `<tr><td style="padding:4px 10px">${icon} ${esc(CRITERIA_LABELS[c])}</td><td style="padding:4px 10px;color:#5b6f66">${esc(call.criteria?.[c]?.evidence)}</td></tr>`;
  }).join('');

  const flags = [...(call.flags ?? []), ...(p.structural_changes_requested ? ['Caller mentioned structural changes — we do not do structural work'] : [])];
  const questions = call.open_questions ?? [];

  const html = wrap(`
    <h2 style="margin:0 0 4px">New qualified enquiry — ${esc(name)}</h2>
    <p style="margin:0 0 14px;color:#5b6f66">Called ${esc(formatIST(call.started_at))}${call.after_hours ? ' · <b>after hours</b>' : ''}${call.returning_caller ? ' · <b>returning caller</b>' : ''} · ${Math.round((call.duration_sec ?? 0) / 60)} min</p>
    <div style="background:#eef5ef;border-radius:8px;padding:10px 12px;margin-bottom:14px">${esc(call.summary)}</div>
    <h3 style="margin:16px 0 6px">Consultation</h3>
    <table style="border-collapse:collapse;width:100%">${row('Slot', when)}${row('Site visit requested', p.site_visit_requested ? 'Yes' : 'No')}${row('Preferred times', p.preferred_times)}</table>
    <h3 style="margin:16px 0 6px">Caller</h3>
    <table style="border-collapse:collapse;width:100%">${row('Name', call.caller_name)}${row('Phone', call.caller_phone)}${row('Email', call.caller_email)}${row('Language', call.language)}${row('Decision-maker', p.decision_maker)}${row('Ownership', p.ownership)}${row('Found us via', p.referral_source)}</table>
    <h3 style="margin:16px 0 6px">Project</h3>
    <table style="border-collapse:collapse;width:100%">${row('Type', [p.property_type, p.subtype].filter(Boolean).join(' · '))}${row('Location', p.location)}${row('Carpet area', p.carpet_area_sqft ? `${Number(p.carpet_area_sqft).toLocaleString('en-IN')} sq ft` : null)}${row('Scope', p.rooms_scope || p.scope_level)}${row('Current state', p.current_state)}${row('Timeline', p.timeline_text)}${row('Budget (volunteered)', p.budget_volunteered_text || 'Not mentioned')}${row('Style notes', p.style_notes)}${row('Pricing asked?', call.pricing_asked ? 'Yes — deflected to consultation' : 'No')}</table>
    <h3 style="margin:16px 0 6px">Rubric</h3>
    <table style="border-collapse:collapse;width:100%">${crit}</table>
    ${flags.length ? `<h3 style="margin:16px 0 6px">⚠️ Flags</h3><ul>${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${questions.length ? `<h3 style="margin:16px 0 6px">Still to ask</h3><ul>${questions.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <details style="margin-top:16px"><summary style="cursor:pointer;color:#2f6b55">Full transcript</summary><pre style="white-space:pre-wrap;font-size:12px;background:#f6faf7;padding:10px;border-radius:6px">${esc(call.transcript)}</pre></details>
  `);

  const text = `New qualified enquiry — ${name}\n${call.summary}\n\nConsultation: ${when}\nPhone: ${dash(call.caller_phone)}\nProject: ${dash(p.subtype)} in ${dash(p.location)}, ${dash(p.carpet_area_sqft)} sq ft\nScope: ${dash(p.rooms_scope)}\nTimeline: ${dash(p.timeline_text)}\nDecision-maker: ${dash(p.decision_maker)}\nFlags: ${flags.join('; ') || 'none'}`;
  return { subject, html, text };
}

export function escalationEmail(call) {
  const ec = call.existing_client ?? {};
  const name = call.caller_name || call.client?.name || 'Existing client';
  const subject = `🔴 URGENT: existing client ${name} — call back within 15 minutes`;
  const html = wrap(`
    <div style="background:#fbdcdc;border:1.5px solid #c9544f;border-radius:8px;padding:12px 14px">
      <h2 style="margin:0 0 4px">Existing client needs a senior callback — within 15 minutes</h2>
      <p style="margin:0">The agent apologised, did not try to solve it, and promised a callback from Nikhil or a senior person.</p>
    </div>
    <table style="border-collapse:collapse;width:100%;margin-top:14px">
      ${row('Caller', name)}${row('Phone', call.caller_phone)}${row('Called at', formatIST(call.started_at))}
      ${row('Project', ec.project_details || call.client?.project)}${row('Designer', ec.designer_name || call.client?.designer)}
      ${row('Complaint', ec.complaint)}${row('Callback preference', ec.callback_preference)}${row('Mood', call.sentiment)}
      ${row('On client list?', call.client ? 'Yes' : 'Not found by phone number — verify')}
    </table>
    <div style="background:#eef5ef;border-radius:8px;padding:10px 12px;margin-top:14px">${esc(call.summary)}</div>
    <details style="margin-top:16px"><summary style="cursor:pointer;color:#2f6b55">Full transcript</summary><pre style="white-space:pre-wrap;font-size:12px;background:#f6faf7;padding:10px;border-radius:6px">${esc(call.transcript)}</pre></details>
  `);
  const text = `URGENT — existing client ${name} (${dash(call.caller_phone)}) needs a senior callback within 15 minutes.\nComplaint: ${dash(ec.complaint)}\nDesigner: ${dash(ec.designer_name)}\n${call.summary}`;
  return { subject, html, text };
}

export const sendHandoff = (call) => sendEmail({ to: process.env.HANDOFF_EMAIL, ...handoffEmail(call) });
export const sendEscalation = (call) => sendEmail({ to: process.env.ESCALATION_EMAIL || process.env.HANDOFF_EMAIL, ...escalationEmail(call) });
