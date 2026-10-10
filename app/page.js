// Nikhil's dashboard: loads the period's numbers from Neon and hands them to the
// client-side Dashboard (design: design_handoff_enquiries_dashboard).
import { query } from '@/lib/db';
import { CRITERIA } from '@/lib/rules';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const TZ = 'Asia/Kolkata';

const istDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const fmtWhen = (d) => {
  const x = new Date(d);
  const day = x.toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
  const time = x.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${day}, ${time}`;
};
const fmtPhone = (p) => (p && /^\d{10}$/.test(p) ? `${p.slice(0, 5)} ${p.slice(5)}` : p || '');
const fmtDur = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;
const shortSlot = (b) => {
  if (!b?.start) return null;
  const x = new Date(b.start);
  const day = x.toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const time = x.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${day}, ${time}`;
};

/** "Agent: …\nCaller: …" → [['Agent', text], ['Caller', text]] */
function parseTranscript(t) {
  if (!t) return null;
  const out = [];
  for (const line of t.split('\n')) {
    const m = line.match(/^\s*(Agent|Caller)\s*:\s*(.*)$/i);
    if (m) out.push([m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), m[2]]);
    else if (line.trim() && out.length) out[out.length - 1][1] += ` ${line.trim()}`;
  }
  return out.length ? out : null;
}

function toCall(c) {
  const p = c.project ?? {};
  const cr = c.criteria ? Object.fromEntries(CRITERIA.map((k) => [k, c.criteria[k]?.status ?? 'unclear'])) : null;
  const ev = c.criteria ? Object.fromEntries(CRITERIA.map((k) => [k, c.criteria[k]?.evidence?.replace(/\s*\[rule\]$/, '') || '—'])) : null;
  const ec = p.existing_client ?? {};
  return {
    id: c.call_id,
    cls: c.classification ?? 'incomplete',
    name: c.caller_name || null,
    phone: fmtPhone(c.caller_phone) || 'Unknown number',
    when: fmtWhen(c.started_at),
    after: c.after_hours,
    returning: c.returning_caller,
    priceQuoted: c.price_quoted,
    dur: fmtDur(c.duration_sec),
    cost: Number(c.cost_voice_inr) + Number(c.cost_ai_inr),
    reason: c.reason || '',
    summary: c.summary || 'No conversation captured.',
    p: {
      type: [p.property_type && p.property_type !== 'unknown' ? p.property_type[0].toUpperCase() + p.property_type.slice(1) : null, p.subtype].filter(Boolean).join(' · ') || null,
      location: p.location || null,
      area: p.carpet_area_sqft ? `${Number(p.carpet_area_sqft).toLocaleString('en-IN')} sq ft` : null,
      scope: p.rooms_scope || (p.scope_level && p.scope_level !== 'unknown' ? p.scope_level.replace(/_/g, ' ') : null),
      timeline: p.timeline_text || null,
      dm: p.decision_maker || null,
      budget: p.budget_volunteered_text || null,
      lang: p.language || null,
      mood: p.sentiment || null,
      designer: ec.designer_name || null,
    },
    cr,
    ev,
    flags: c.flags ?? [],
    booking: c.booking?.start ? { status: c.booking.status === 'booked' ? 'booked' : 'requested', when: shortSlot(c.booking), site: Boolean(c.booking.site_visit ?? p.site_visit_requested) } : null,
    act: { handoff: c.handoff_sent, esc: c.escalation_sent, crm: Boolean(c.hubspot_deal_id) },
    won: c.converted,
    tx: parseTranscript(c.transcript),
  };
}

async function load(days) {
  const since = `now() - interval '${days} days'`;
  const [s] = await query(`
    select count(*)::int as calls,
      count(*) filter (where coalesce(length(transcript),0) > 0 or duration_sec > 0)::int as answered,
      count(*) filter (where after_hours)::int as after_hours,
      count(*) filter (where classification = 'qualified')::int as qualified,
      count(*) filter (where classification = 'not_fit')::int as not_fit,
      count(*) filter (where classification = 'incomplete')::int as incomplete,
      count(*) filter (where classification = 'existing_client')::int as existing_client,
      count(*) filter (where classification = 'other')::int as other,
      count(*) filter (where booking is not null)::int as booked,
      count(*) filter (where booking->>'status' = 'booked')::int as booked_confirmed,
      count(*) filter (where converted)::int as converted,
      count(*) filter (where handoff_sent)::int as handoffs_sent,
      count(*) filter (where escalation_sent)::int as escalations_sent,
      count(*) filter (where pricing_asked)::int as pricing_asked,
      count(*) filter (where price_quoted)::int as price_quoted,
      count(*) filter (where returning_caller)::int as returning_callers,
      coalesce(sum(cost_voice_inr),0)::float as voice,
      coalesce(sum(cost_ai_inr),0)::float as ai,
      coalesce(round(sum(duration_sec) / 60.0),0)::int as minutes
    from calls where started_at > ${since}`);
  const dailyRows = await query(`
    select to_char((started_at at time zone '${TZ}')::date, 'YYYY-MM-DD') as day,
      count(*) filter (where not after_hours)::int as inh,
      count(*) filter (where after_hours)::int as aft
    from calls where started_at > ${since} group by 1`);
  const rows = await query(`select * from calls where started_at > ${since} order by started_at desc limit 100`);
  const [errs] = await query(`select count(*)::int as n from events where type = 'error' and created_at > ${since}`);
  const clients = await query('select phone, name, project, designer from clients order by created_at desc limit 100');

  // Every day in range (IST), so gaps show as zero.
  const map = Object.fromEntries(dailyRows.map((d) => [d.day, d]));
  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 864e5);
    const key = istDay(dt);
    const noon = new Date(`${key}T12:00:00+05:30`);
    daily.push({
      label: noon.toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }),
      long: noon.toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''),
      inh: map[key]?.inh ?? 0,
      aft: map[key]?.aft ?? 0,
    });
  }

  const fixed = Number(process.env.FIXED_MONTHLY_COST_INR || 0) * (days / 30);
  return {
    summary: { ...s, integration_errors: errs.n },
    costs: { voice: s.voice, ai: s.ai, fixed },
    daily,
    calls: rows.map(toCall),
    clients: clients.map((c) => ({ phone: fmtPhone(c.phone), name: c.name || '—', project: c.project || '—', designer: c.designer || '—' })),
  };
}

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp?.days)) ? Number(sp.days) : 30;

  const now = new Date();
  const hour = Number(now.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false })) % 24;
  const meta = {
    greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
    dateLine: `${now.toLocaleString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')} · the front desk at a glance`,
    updated: `Updated ${fmtWhen(now)} IST`,
  };

  let data;
  try {
    data = await load(days);
  } catch (err) {
    return (
      <main style={{ maxWidth: 720, margin: '60px auto', padding: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>Aangan Studio</h1>
        <p style={{ padding: '14px 18px', borderRadius: 20, background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>Database not reachable: {err.message}</p>
      </main>
    );
  }
  return <Dashboard days={days} meta={meta} {...data} />;
}
