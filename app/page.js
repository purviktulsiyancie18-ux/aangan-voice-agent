// Nikhil's dashboard: what the phone agent is doing, what it's generating, and what it costs.
import { query } from '@/lib/db';
import { CRITERIA, CRITERIA_LABELS, formatIST } from '@/lib/rules';
import { toggleConverted, addClient, removeClient } from './actions';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const LABELS = { qualified: 'Qualified', not_fit: 'Not a fit', incomplete: 'Incomplete', existing_client: 'Existing client', other: 'Other' };
const inr = (n, d = 0) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

async function load(days) {
  const since = `now() - interval '${days} days'`;
  const [t] = await query(`
    select count(*)::int as calls,
      count(*) filter (where coalesce(length(transcript),0) > 0)::int as answered,
      count(*) filter (where after_hours)::int as after_hours,
      count(*) filter (where classification = 'qualified')::int as qualified,
      count(*) filter (where classification = 'not_fit')::int as not_fit,
      count(*) filter (where classification = 'incomplete')::int as incomplete,
      count(*) filter (where classification = 'existing_client')::int as existing_client,
      count(*) filter (where classification = 'other')::int as other,
      count(*) filter (where booking is not null)::int as booked,
      count(*) filter (where booking->>'status' = 'booked')::int as booked_confirmed,
      count(*) filter (where converted)::int as converted,
      count(*) filter (where handoff_sent)::int as handoffs,
      count(*) filter (where escalation_sent)::int as escalations,
      count(*) filter (where pricing_asked)::int as pricing_asked,
      count(*) filter (where price_quoted)::int as price_quoted,
      count(*) filter (where returning_caller)::int as returning,
      coalesce(sum(cost_voice_inr),0)::float as voice,
      coalesce(sum(cost_ai_inr),0)::float as ai,
      coalesce(sum(duration_sec),0)::int as seconds
    from calls where started_at > ${since}`);
  const daily = await query(`
    select to_char((started_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day,
      count(*) filter (where not after_hours)::int as in_hours,
      count(*) filter (where after_hours)::int as after_hours
    from calls where started_at > ${since} group by 1 order by 1`);
  const recent = await query(`select * from calls where started_at > ${since} order by started_at desc limit 100`);
  const [errs] = await query(`select count(*)::int as n from events where type = 'error' and created_at > ${since}`);
  const clients = await query('select * from clients order by created_at desc limit 50');
  return { t, daily, recent, errors: errs.n, clients };
}

function DailyChart({ daily, days }) {
  // Fill every day in range so gaps show as zero.
  const map = Object.fromEntries(daily.map((d) => [d.day, d]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400e3).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    series.push({ day: d, in_hours: map[d]?.in_hours ?? 0, after_hours: map[d]?.after_hours ?? 0 });
  }
  const W = 640, H = 190, pl = 26, pb = 22, pt = 8;
  const max = Math.max(4, ...series.map((s) => s.in_hours + s.after_hours));
  const step = (W - pl) / series.length;
  const bw = Math.max(2, step - 2);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.ceil(series.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calls per day, in hours and after hours">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={pl - 6} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      {series.map((s, i) => {
        const x = pl + i * step + 1;
        const total = s.in_hours + s.after_hours;
        const hIn = (H - pt - pb) * (s.in_hours / max);
        const hAf = (H - pt - pb) * (s.after_hours / max);
        const label = new Date(`${s.day}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return (
          <g key={s.day} className="bar">
            <title>{`${label}: ${total} calls — ${s.in_hours} in hours, ${s.after_hours} after hours`}</title>
            <rect x={x - 1} y={pt} width={step} height={H - pt - pb} fill="transparent" />
            {s.in_hours > 0 && <rect x={x} y={y(s.in_hours)} width={bw} height={hIn} rx="2" fill="var(--series-1)" />}
            {s.after_hours > 0 && <rect x={x} y={y(total)} width={bw} height={Math.max(0, hAf - (s.in_hours ? 2 : 0))} rx="2" fill="var(--series-2)" />}
            {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle">{label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Outcomes({ t }) {
  const rows = Object.keys(LABELS).map((k) => ({ k, n: t[k] }));
  const max = Math.max(1, ...rows.map((r) => r.n));
  return rows.map((r) => (
    <div className="hbar" key={r.k} title={`${LABELS[r.k]}: ${r.n} (${pct(r.n, t.calls)}%)`}>
      <span>{LABELS[r.k]}</span>
      <div className="track"><div className="fill" style={{ width: `${(r.n / max) * 100}%` }} /></div>
      <span className="n">{r.n}</span>
    </div>
  ));
}

function CallRow({ c }) {
  const p = c.project ?? {};
  const b = c.booking;
  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>
        {formatIST(c.started_at)}
        {c.after_hours && <span className="tag">after hrs</span>}
      </td>
      <td style={{ minWidth: 280 }}>
        <details className="call">
          <summary>
            <b>{c.caller_name || c.caller_phone || 'Unknown'}</b>
            {c.returning_caller && <span className="tag">returning</span>}
            <span className="tag">{[p.subtype, p.location].filter(Boolean).join(' · ')}</span>
            <div className="note">{c.reason}</div>
          </summary>
          <dl className="callbox">
            <div><dt>Summary</dt><dd>{c.summary || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{c.caller_phone || '—'}</dd></div>
            <div><dt>Area · scope</dt><dd>{p.carpet_area_sqft ? `${p.carpet_area_sqft} sq ft · ` : ''}{p.rooms_scope || p.scope_level || '—'}</dd></div>
            <div><dt>Timeline</dt><dd>{p.timeline_text || '—'}</dd></div>
            <div><dt>Decision-maker</dt><dd>{p.decision_maker || '—'}</dd></div>
            <div><dt>Budget (volunteered)</dt><dd>{p.budget_volunteered_text || 'Not mentioned'}</dd></div>
            <div><dt>Language · mood</dt><dd>{[p.language, p.sentiment].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt>Booking</dt><dd>{b ? `${b.spoken ?? formatIST(b.start)} (${b.status})` : '—'}</dd></div>
            {c.criteria && (
              <div style={{ gridColumn: '1 / -1' }}>
                <dt>Rubric</dt>
                <dd>{CRITERIA.map((k) => {
                  const s = c.criteria[k]?.status;
                  return <div key={k}>{s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⚠️'} {CRITERIA_LABELS[k]} — <span className="note">{c.criteria[k]?.evidence}</span></div>;
                })}</dd>
              </div>
            )}
            {(c.flags ?? []).length > 0 && <div style={{ gridColumn: '1 / -1' }}><dt>Flags</dt><dd>{c.flags.join(' · ')}</dd></div>}
            <pre className="tx">{c.transcript || 'No transcript (missed / dropped call)'}</pre>
          </dl>
        </details>
      </td>
      <td><span className={`pill ${c.classification}`}>{LABELS[c.classification] ?? c.classification ?? '—'}</span></td>
      <td>
        {b ? (b.status === 'booked' ? '📅 Booked' : '📝 Requested') : '—'}
        {c.handoff_sent && <div className="note">✉️ handoff sent</div>}
        {c.escalation_sent && <div className="note" style={{ color: 'var(--bad)' }}>🔴 escalated</div>}
        {c.hubspot_deal_id && <div className="note">HubSpot deal</div>}
        {c.price_quoted && <div className="note" style={{ color: 'var(--bad)' }}>⚠️ price mentioned</div>}
      </td>
      <td className="num">{Math.floor(c.duration_sec / 60)}:{String(c.duration_sec % 60).padStart(2, '0')}</td>
      <td className="num">{inr(Number(c.cost_voice_inr) + Number(c.cost_ai_inr), 2)}</td>
      <td>
        {c.classification === 'qualified' && (
          <form action={toggleConverted}>
            <input type="hidden" name="call_id" value={c.call_id} />
            <button className={c.converted ? 'on' : ''} title="Mark whether this lead became a project">{c.converted ? '✓ Won' : 'Mark won'}</button>
          </form>
        )}
      </td>
    </tr>
  );
}

export default async function Dashboard({ searchParams }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp?.days)) ? Number(sp.days) : 30;

  let data;
  try {
    data = await load(days);
  } catch (err) {
    return <main className="wrap"><h1>Aangan — Phone enquiries</h1><div className="banner bad">Database not reachable: {err.message}</div></main>;
  }
  const { t, daily, recent, errors, clients } = data;

  const fixed = Number(process.env.FIXED_MONTHLY_COST_INR || 0) * (days / 30);
  const total = t.voice + t.ai + fixed;
  const perCall = t.calls ? total / t.calls : 0;
  const perLead = t.qualified ? total / t.qualified : 0;
  const answeredPct = pct(t.answered, t.calls);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Aangan Studio — Phone enquiries</h1>
          <p className="sub">Every call answered by the agent, 24/7 · Last {days} days · Updated {formatIST(new Date())} IST</p>
        </div>
        <nav className="range" aria-label="Date range">
          {RANGES.map((r) => <a key={r} href={`/?days=${r}`} className={r === days ? 'on' : ''}>{r} days</a>)}
        </nav>
      </header>

      {t.price_quoted > 0
        ? <div className="banner bad">⚠️ Compliance: on {t.price_quoted} call{t.price_quoted > 1 ? 's' : ''} the agent may have mentioned a price. Review the flagged calls below — no number should ever be quoted before the consultation.</div>
        : t.calls > 0 && <div className="banner ok">✓ No price quoted on any call. {t.pricing_asked} caller{t.pricing_asked === 1 ? '' : 's'} asked about pricing and {t.pricing_asked === 1 ? 'was' : 'were'} offered a consultation instead.</div>}
      {t.existing_client > 0 && <div className="banner bad">🔴 {t.existing_client} existing-client escalation{t.existing_client > 1 ? 's' : ''} — {t.escalations} alert{t.escalations === 1 ? '' : 's'} sent for a 15-minute senior callback.</div>}

      <section className="tiles">
        <div className="tile"><div className="k">Calls answered</div><div className="v">{t.answered}</div><div className="d">{answeredPct}% of {t.calls} calls · before: ~48% unanswered in 48 hrs</div></div>
        <div className="tile"><div className="k">After-hours caught</div><div className="v">{t.after_hours}</div><div className="d">{pct(t.after_hours, t.calls)}% of calls came outside 10am–7pm / weekends</div></div>
        <div className="tile"><div className="k">Qualified leads</div><div className="v">{t.qualified}</div><div className="d">{pct(t.qualified, t.calls)}% of calls · {t.handoffs} handoff note{t.handoffs === 1 ? '' : 's'} emailed</div></div>
        <div className="tile"><div className="k">Consultations booked</div><div className="v">{t.booked}</div><div className="d">{t.booked_confirmed} confirmed in calendar · {t.converted} won</div></div>
        <div className="tile"><div className="k">Running cost</div><div className="v">{inr(total)}</div><div className="d">{inr(perCall, 2)} per call · {t.qualified ? inr(perLead, 0) : '—'} per qualified lead</div></div>
        <div className="tile"><div className="k">Pipeline to designers</div><div className="v">₹{(t.qualified * 8).toLocaleString('en-IN')}–{(t.qualified * 14).toLocaleString('en-IN')} L</div><div className="d">{t.qualified} qualified × ₹8–14 L average project</div></div>
      </section>

      <section className="grid2">
        <div className="card">
          <h2>Calls per day</h2>
          <div className="legend"><span><i style={{ background: 'var(--series-1)' }} />In hours</span><span><i style={{ background: 'var(--series-2)' }} />After hours (front desk closed)</span></div>
          {t.calls ? <DailyChart daily={daily} days={days} /> : <div className="empty">No calls yet in this period.</div>}
        </div>
        <div className="card">
          <h2>Outcomes</h2>
          <Outcomes t={t} />
          <p className="note" style={{ marginTop: 10 }}>Nikhil's rubric decides: any failed criterion → not a fit; unclear project / area / timeline → incomplete (front desk follows up).</p>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <h2>What the system costs</h2>
          <table>
            <tbody>
              <tr><td>Voice + telephony (Vaani Labs)</td><td className="num">{inr(t.voice, 2)}</td><td className="note">{Math.round(t.seconds / 60)} min of calls</td></tr>
              <tr><td>AI analysis (Gemini Flash)</td><td className="num">{inr(t.ai, 2)}</td><td className="note">classification + handoff extraction</td></tr>
              <tr><td>Fixed (pro-rated)</td><td className="num">{inr(fixed, 2)}</td><td className="note">Neon, Vercel, Resend, Cal.com, HubSpot on free tiers</td></tr>
              <tr><td><b>Total</b></td><td className="num"><b>{inr(total, 2)}</b></td><td className="note">{inr(perCall, 2)} / call</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Value it's generating</h2>
          <table>
            <tbody>
              <tr><td>Qualified leads with full handoff</td><td className="num">{t.qualified}</td></tr>
              <tr><td>Calls that would have rung out after hours</td><td className="num">{t.after_hours}</td></tr>
              <tr><td>Returning callers recognised</td><td className="num">{t.returning}</td></tr>
              <tr><td>Leads marked won</td><td className="num">{t.converted}</td></tr>
              <tr><td>One won project (₹8–14 L) vs this period's cost</td><td className="num">{total ? `${Math.round(800000 / total).toLocaleString('en-IN')}×+` : '—'}</td></tr>
            </tbody>
          </table>
          {errors > 0 && <p className="note" style={{ color: 'var(--bad)' }}>{errors} integration error{errors > 1 ? 's' : ''} logged in this period (see events table).</p>}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2>Calls</h2>
        {recent.length ? (
          <div className="scroll">
            <table>
              <thead><tr><th>When (IST)</th><th>Caller · click for handoff details</th><th>Outcome</th><th>Actions taken</th><th className="num">Length</th><th className="num">Cost</th><th>Won?</th></tr></thead>
              <tbody>{recent.map((c) => <CallRow key={c.call_id} c={c} />)}</tbody>
            </table>
          </div>
        ) : <div className="empty">No calls yet. Once Vaani is connected, every call appears here within seconds of hanging up.</div>}
      </section>

      <section className="card">
        <h2>Existing clients</h2>
        <p className="note">Calls from these numbers are recognised as existing clients; complaints trigger an urgent escalation email.</p>
        <form action={addClient} className="inline">
          <input name="phone" placeholder="Phone" required />
          <input name="name" placeholder="Name" />
          <input name="project" placeholder="Project (e.g. 2BHK Viman Nagar)" />
          <input name="designer" placeholder="Designer" />
          <button>Add client</button>
        </form>
        {clients.length > 0 && (
          <div className="scroll" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Phone</th><th>Name</th><th>Project</th><th>Designer</th><th /></tr></thead>
              <tbody>{clients.map((k) => (
                <tr key={k.phone}><td>{k.phone}</td><td>{k.name}</td><td>{k.project}</td><td>{k.designer}</td>
                  <td><form action={removeClient}><input type="hidden" name="phone" value={k.phone} /><button>Remove</button></form></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
