'use client';
// Aangan Studio enquiry dashboard — built from design_handoff_enquiries_dashboard
// (Enquiries Dashboard.dc.html + tokens.css). Data comes from app/page.js.
import { useEffect, useLayoutEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setConverted, addClient, removeClient } from './actions';
import { signOut } from './login/actions';

const SERIF = 'var(--font-display)';
const OUT = {
  qualified: { label: 'Qualified', icon: '✓', color: 'var(--c-q)', hint: 'Handoff sent to a designer' },
  not_fit: { label: 'Not a fit', icon: '✕', color: 'var(--c-nf)', hint: 'Failed a rubric criterion' },
  incomplete: { label: 'Incomplete', icon: '…', color: 'var(--c-inc)', hint: 'Front desk follows up' },
  existing_client: { label: 'Existing client', icon: '!', color: 'var(--c-ex)', hint: 'Escalated to a senior' },
  other: { label: 'Other', icon: '○', color: 'var(--c-oth)', hint: 'Spam, vendors' },
};
const PILL = {
  qualified: ['var(--ok-soft)', 'var(--ok-text)'],
  not_fit: ['var(--surface-3)', 'var(--ink-2)'],
  incomplete: ['var(--warn-soft)', 'var(--warn-text)'],
  existing_client: ['var(--bad-soft)', 'var(--bad-text)'],
  other: ['var(--surface-3)', 'var(--ink-2)'],
};
const CRIT = [['real_project', 'Real project'], ['service_area', 'Service area'], ['timeline', 'Timeline'], ['budget', 'Budget'], ['decision_maker', 'Decision-maker']];
const inr = (n, d = 0) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 28, boxShadow: 'var(--card-sh)', padding: 24, display: 'flex', flexDirection: 'column' };
const h3 = { margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 24 };
const chip = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: bg, color: fg });

function go(id) {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}

function ArchMark({ size = 44, inner = [16, 20], radius = 14 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface)', border: '1px solid var(--line-2)', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <div style={{ width: inner[0], height: inner[1], border: '1.5px solid var(--accent)', borderBottomWidth: 0, borderRadius: '999px 999px 3px 3px' }} />
    </div>
  );
}

const ThemeGlyph = ({ s = 14 }) => (
  <span style={{ width: s, height: s, borderRadius: '50%', border: '1.5px solid var(--ink)', background: 'linear-gradient(90deg,var(--ink) 50%,transparent 50%)' }} />
);

export default function Dashboard({ days, meta, summary, costs, daily, calls: initialCalls, clients: initialClients }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [w, setW] = useState(1400);
  const [theme, setTheme] = useState('light');
  const [hover, setHover] = useState(-1);
  const [filter, setFilter] = useState('all');
  const [afterOnly, setAfterOnly] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [navSel, setNavSel] = useState('overview');
  const [txOpen, setTxOpen] = useState({});
  const [won, setWon] = useState({});
  const [clients, setClients] = useState(initialClients);
  const [form, setForm] = useState({ phone: '', name: '', project: '', designer: '' });

  useIsoLayoutEffect(() => {
    const r = () => setW(window.innerWidth);
    r();
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  useEffect(() => setClients(initialClients), [initialClients]);
  useEffect(() => setWon({}), [initialCalls]);

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('aangan-theme', t); } catch {}
  };

  const mobile = w < 820;
  const mid = !mobile && w < 1180;
  const S = summary;
  const empty = S.calls === 0;
  const calls = initialCalls;
  const isWon = (c) => won[c.id] ?? c.won;
  const converted = Math.max(0, S.converted + calls.reduce((a, c) => a + (isWon(c) !== c.won ? (isWon(c) ? 1 : -1) : 0), 0));
  const total = costs.voice + costs.ai + costs.fixed;
  const perCall = S.calls ? total / S.calls : 0;
  const perLead = S.qualified ? total / S.qualified : 0;
  const needsCount = calls.filter((c) => c.cls === 'incomplete' || c.cls === 'existing_client').length;

  // ---------- checks ----------
  const quoted = calls.filter((c) => c.priceQuoted);
  const latestEsc = calls.find((c) => c.cls === 'existing_client');
  const checks = empty
    ? [{ role: 'status', icon: '○', iconBg: 'var(--c-nf)', title: 'Checks start with the first call', body: 'Pricing compliance and escalations will appear here.', bg: 'var(--surface)', bd: 'var(--line)', titleFg: 'var(--ink)' }]
    : [
        S.price_quoted > 0
          ? { role: 'alert', icon: '!', iconBg: 'var(--bad)', title: `Price quoted on ${S.price_quoted} call${S.price_quoted > 1 ? 's' : ''}`, body: `${quoted[0] ? `${quoted[0].name || quoted[0].phone} · ${quoted[0].when}. ` : ''}The agent must never quote a price — review the transcript and the prompt.`, bg: 'var(--bad-soft)', bd: 'var(--bad)', titleFg: 'var(--bad-text)', btn: 'Review call', btnBd: 'var(--bad)', on: () => { if (quoted[0]) setSel(quoted[0].id); setFilter('all'); setAfterOnly(false); setNeeds(false); setQ(''); go('calls'); } }
          : { role: 'status', icon: '✓', iconBg: 'var(--ok)', title: 'No price quoted on any call', body: `${S.pricing_asked} caller${S.pricing_asked === 1 ? '' : 's'} asked about price and ${S.pricing_asked === 1 ? 'was' : 'were'} offered a consultation instead.`, bg: 'var(--ok-soft)', bd: 'color-mix(in oklab,var(--ok) 45%,transparent)', titleFg: 'var(--ok-text)' },
        ...(S.escalations_sent > 0 || S.existing_client > 0
          ? [{ role: 'alert', icon: '!', iconBg: 'var(--bad)', title: `${S.existing_client} existing-client escalation${S.existing_client === 1 ? '' : 's'}`, body: `Senior callback within 15 min.${latestEsc ? ` Latest: ${latestEsc.name || latestEsc.phone}, ${latestEsc.when}.` : ''}`, bg: 'var(--bad-soft)', bd: 'color-mix(in oklab,var(--bad) 45%,transparent)', titleFg: 'var(--bad-text)', btn: 'View', btnBd: 'var(--line-2)', on: () => { setNeeds(true); setFilter('all'); if (latestEsc) setSel(latestEsc.id); go('calls'); } }]
          : []),
      ];

  // ---------- bento ----------
  const G = mobile ? { big: '1 / -1', sm: 'span 1' } : mid ? { big: 'span 6', sm: 'span 3', xs: 'span 2' } : null;
  const pipeLo = S.qualified * 8, pipeHi = S.qualified * 14;
  const tile = (o) => ({ bg: 'var(--surface)', bd: 'var(--line)', size: '38px', ...o });
  const tiles = [
    tile({ label: 'Pipeline sent to designers', dot: 'var(--accent)', value: empty ? '₹0' : `₹${pipeLo.toLocaleString('en-IN')}–${pipeHi.toLocaleString('en-IN')} L`, sub: empty ? '—' : `${S.qualified} qualified × ₹8–14 L average project`, bg: 'var(--accent-soft)', bd: 'color-mix(in oklab,var(--accent) 40%,transparent)', size: mobile ? '38px' : '48px', gc: G ? G.big : '7 / span 6', gr: G ? 'auto' : '1' }),
    tile({ label: 'Qualified leads', dot: 'var(--c-q)', value: S.qualified, sub: empty ? '—' : `${pct(S.qualified, S.calls)} of calls · ${S.handoffs_sent} handoff${S.handoffs_sent === 1 ? '' : 's'} sent`, gc: G ? G.sm : '7 / span 3', gr: G ? 'auto' : '2' }),
    tile({ label: 'Consultations booked', dot: 'var(--c-inc)', value: S.booked, sub: empty ? '—' : `${S.booked_confirmed} confirmed · ${converted} won`, gc: G ? G.sm : '10 / span 3', gr: G ? 'auto' : '2' }),
    tile({ label: 'Calls answered', dot: 'var(--ok)', value: S.answered, sub: empty ? 'Waiting for the first call' : `${pct(S.answered, S.calls)} of ${S.calls} calls`, note: 'Before: 48% unanswered', gc: G ? G.xs || G.sm : '1 / span 4', gr: G ? 'auto' : '3' }),
    tile({ label: 'After-hours caught', dot: 'var(--bar-after)', value: S.after_hours, sub: empty ? '—' : `${pct(S.after_hours, S.calls)} of calls · after 7 pm & weekends`, note: 'Before: rang out', gc: G ? G.xs || G.sm : '5 / span 4', gr: G ? 'auto' : '3' }),
    tile({ label: 'Running cost', dot: 'var(--c-oth)', value: inr(total), sub: empty ? 'Billed per minute — nothing yet' : `${inr(perCall, 2)} per call · ${S.qualified ? `${inr(perLead, 2)} per qualified lead` : 'no qualified leads yet'}`, gc: G ? (mobile ? '1 / -1' : G.xs) : '9 / span 4', gr: G ? 'auto' : '3' }),
  ];
  const afterPct = S.calls ? Math.round((S.after_hours / S.calls) * 100) : 0;
  const answeredAfterPct = S.after_hours ? 100 : 0;
  const unansweredNow = S.calls ? Math.round(((S.calls - S.answered) / S.calls) * 100) : 0;
  const compare = [
    { title: 'Enquiries left unanswered for 48 h', before: '48%', beforeW: '48%', now: empty ? '—' : `${unansweredNow}%`, nowW: `${unansweredNow}%` },
    { title: 'After-hours calls picked up', before: '0%', beforeW: '0%', now: empty || !S.after_hours ? '—' : `${answeredAfterPct}%`, nowW: `${answeredAfterPct}%` },
  ];

  // ---------- chart ----------
  const yMax = Math.ceil(Math.max(2, ...daily.map((d) => d.inh + d.aft)) / 2) * 2;
  const step = days === 7 ? 1 : days === 30 ? 5 : 15;
  const n = daily.length;
  const barGap = days === 90 ? 1 : days === 7 ? 14 : 4;

  // ---------- outcomes ----------
  const ocounts = { qualified: S.qualified, not_fit: S.not_fit, incomplete: S.incomplete, existing_client: S.existing_client, other: S.other };
  const osum = Object.values(ocounts).reduce((a, b) => a + b, 0);
  const R = 62, Cc = 2 * Math.PI * R;
  let acc = 0;
  const segs = osum ? Object.keys(OUT).map((key) => { const len = (ocounts[key] / osum) * Cc; const s = { key, color: OUT[key].color, len, off: acc }; acc += len; return s; }).filter((x) => x.len > 0) : [];
  const single = segs.length === 1;

  // ---------- funnel ----------
  const fsteps = [['Calls', S.calls], ['Qualified', S.qualified], ['Booked', S.booked], ['Won', converted]];
  const funnel = fsteps.map(([label, v], i) => ({ label, value: v, step: i === 0 ? 'all enquiries' : `${pct(v, fsteps[i - 1][1])} of ${fsteps[i - 1][0].toLowerCase()}`, h: S.calls ? `${Math.max(14, (v / S.calls) * 100)}%` : '14%', color: ['var(--surface-3)', 'var(--c-q)', 'var(--bar-after)', 'var(--accent)'][i] }));

  // ---------- calls list ----------
  const qq = q.trim().toLowerCase().replace(/\s/g, '');
  const list = useMemo(() => calls.filter((c) =>
    (filter === 'all' || c.cls === filter) &&
    (!afterOnly || c.after) &&
    (!needs || c.cls === 'incomplete' || c.cls === 'existing_client') &&
    (!qq || (c.name || '').toLowerCase().replace(/\s/g, '').includes(qq) || c.phone.replace(/\s/g, '').includes(qq))), [calls, filter, afterOnly, needs, qq]);
  const cnt = (key) => calls.filter((c) => key === 'all' || c.cls === key).length;
  const selC = list.find((c) => c.id === sel) || list[0];

  const roi = total ? `${Math.round(800000 / total).toLocaleString('en-IN')}–${Math.round(1400000 / total).toLocaleString('en-IN')}×` : '—';

  const changeRange = (r) => {
    setHover(-1);
    startTransition(() => router.push(`/?days=${r}`, { scroll: false }));
  };

  const toggleWon = (c) => {
    const next = !isWon(c);
    setWon((s) => ({ ...s, [c.id]: next }));
    startTransition(async () => { await setConverted(c.id, next); router.refresh(); });
  };

  const onAddClient = () => {
    if (!form.phone || !form.name) return;
    const f = form;
    setClients((cl) => [{ ...f, project: f.project || '—', designer: f.designer || '—' }, ...cl]);
    setForm({ phone: '', name: '', project: '', designer: '' });
    startTransition(async () => { await addClient(f); router.refresh(); });
  };
  const onRemoveClient = (phone) => {
    setClients((cl) => cl.filter((c) => c.phone !== phone));
    startTransition(async () => { await removeClient(phone); router.refresh(); });
  };

  const nav = [['overview', 'Overview'], ['calls', 'Calls'], ['money', 'Cost & value'], ['clients', 'Existing clients']];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 1480, margin: '0 auto', display: 'flex', alignItems: 'flex-start' }}>
        {/* Sidebar */}
        {!mobile && (
          <aside style={{ position: 'sticky', top: 0, height: '100vh', width: 248, flex: 'none', padding: '28px 18px 24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ArchMark />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.1 }}>Aangan Studio</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Enquiry desk</span>
              </div>
            </div>
            <nav aria-label="Sections" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nav.map(([id, label]) => (
                <button key={id} className="h-nav" onClick={() => { setNavSel(id); go(id); }} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderRadius: 14, fontWeight: 600, fontSize: 14, background: navSel === id ? 'var(--surface)' : 'transparent', color: navSel === id ? 'var(--ink)' : 'var(--ink-2)' }}>
                  <span>{label}</span>
                  {id === 'calls' && needsCount > 0 && (
                    <span aria-label={`${needsCount} need action`} style={{ fontSize: 11, fontWeight: 700, minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999, background: 'var(--bad-soft)', color: 'var(--bad-text)', display: 'grid', placeItems: 'center' }}>{needsCount}</span>
                  )}
                </button>
              ))}
            </nav>
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--card-sh)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--ok-text)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />Receptionist live · 24/7</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{meta.updated}</span>
              </div>
              <button onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 600, height: 42, borderRadius: 999, cursor: 'pointer' }}>
                <ThemeGlyph />{theme === 'dark' ? 'Light' : 'Dark'} mode
              </button>
              <form action={signOut}>
                <button type="submit" className="h-nav" style={{ width: '100%', border: 0, background: 'transparent', color: 'var(--ink-2)', font: 'inherit', fontSize: 13, fontWeight: 600, height: 36, borderRadius: 999, cursor: 'pointer' }}>Sign out</button>
              </form>
            </div>
          </aside>
        )}

        <main style={{ flex: 1, minWidth: 0, padding: mobile ? '16px 14px 24px' : '32px 32px 40px 12px', display: 'flex', flexDirection: 'column', gap: mobile ? 16 : 22, opacity: pending ? 0.7 : 1, transition: 'opacity .2s' }}>
          {mobile && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ArchMark size={38} inner={[13, 17]} radius={12} />
                <span style={{ fontFamily: SERIF, fontSize: 19 }}>Aangan Studio</span>
              </div>
              <button onClick={toggleTheme} aria-label="Toggle colour theme" style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--line-2)', background: 'var(--surface)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ThemeGlyph s={16} /></button>
            </div>
          )}

          {/* Greeting */}
          <header id="overview" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{mobile ? meta.updated : meta.dateLine}</span>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: mobile ? 30 : 40, lineHeight: 1.1, letterSpacing: '-.015em' }}>{meta.greeting}, <em style={{ fontStyle: 'italic', color: 'var(--accent-text)' }}>Nikhil</em></h1>
            </div>
            <div role="tablist" aria-label="Date range" style={{ display: 'flex', padding: 4, background: 'var(--surface-3)', borderRadius: 999, gap: 2 }}>
              {[7, 30, 90].map((r) => (
                <button key={r} role="tab" aria-selected={days === r} onClick={() => changeRange(r)} style={{ border: 0, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 600, padding: '0 16px', height: 36, borderRadius: 999, background: days === r ? 'var(--surface)' : 'transparent', color: days === r ? 'var(--ink)' : 'var(--ink-2)', boxShadow: days === r ? '0 1px 3px rgba(60,40,20,.14)' : 'none' }}>{r} days</button>
              ))}
            </div>
          </header>

          {/* Checks */}
          <section aria-label="Checks" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
            {checks.map((ck) => (
              <div key={ck.title} role={ck.role} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', borderRadius: 22, background: ck.bg, border: `1px solid ${ck.bd}` }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: ck.iconBg, color: 'var(--surface)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, flex: 'none' }}>{ck.icon}</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 700, color: ck.titleFg }}>{ck.title}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', textWrap: 'pretty' }}>{ck.body}</span>
                </div>
                {ck.btn && (
                  <button onClick={ck.on} style={{ alignSelf: 'center', border: `1px solid ${ck.btnBd}`, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 600, height: 38, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap' }}>{ck.btn}</button>
                )}
              </div>
            ))}
          </section>

          {/* Bento */}
          <section aria-label="Key numbers" style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : mid ? 'repeat(6,minmax(0,1fr))' : 'repeat(12,minmax(0,1fr))', gap: 14 }}>
            <div style={{ gridColumn: mobile || mid ? '1 / -1' : '1 / span 6', gridRow: mobile || mid ? 'auto' : '1 / span 2', position: 'relative', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 28, boxShadow: 'var(--shadow)', padding: mobile ? '22px 20px' : '34px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 28 }}>
              {!mobile && !mid && (
                <>
                  <div aria-hidden="true" style={{ position: 'absolute', right: -70, bottom: -120, width: 240, height: 320, border: '1px solid var(--line-2)', borderRadius: '999px 999px 40px 40px', pointerEvents: 'none' }} />
                  <div aria-hidden="true" style={{ position: 'absolute', right: -30, bottom: -110, width: 160, height: 240, border: '1px solid var(--line)', borderRadius: '999px 999px 32px 32px', pointerEvents: 'none' }} />
                </>
              )}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', background: 'var(--accent-soft)', padding: '5px 12px', borderRadius: 999 }}>Last {days} days</span>
                <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: mobile ? 34 : 50, lineHeight: 1.06, letterSpacing: '-.02em', textWrap: 'balance', maxWidth: '14ch' }}>
                  {empty ? 'Ready for the first call.' : `${S.calls} ${S.calls === 1 ? 'enquiry' : 'enquiries'}. ${S.answered === S.calls ? (S.calls === 1 ? 'Answered.' : 'Every one answered.') : `${S.answered} answered.`}`}
                </h2>
                <p style={{ margin: 0, maxWidth: '46ch', color: 'var(--ink-2)', fontSize: 15, textWrap: 'pretty' }}>
                  {empty ? 'The receptionist is live 24/7. Numbers fill in as calls arrive.' : `${S.after_hours} came in after the front desk closed — calls that used to ring out. Answering within the hour converts 4× better.`}
                </p>
              </div>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16, padding: 18, borderRadius: 20, background: 'var(--surface-2)' }}>
                {compare.map((c) => (
                  <div key={c.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, textWrap: 'balance' }}>{c.title}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) 44px', alignItems: 'center', gap: '6px 10px', fontSize: 12, color: 'var(--ink-3)' }}>
                      <span>Before</span>
                      <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}><div style={{ height: '100%', width: c.beforeW, background: 'var(--c-nf)', borderRadius: 999 }} /></div>
                      <span style={{ textAlign: 'right', fontWeight: 600 }}>{c.before}</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Now</span>
                      <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}><div style={{ height: '100%', width: c.nowW, background: 'var(--ok)', borderRadius: 999 }} /></div>
                      <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok-text)' }}>{c.now}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {tiles.map((k) => (
              <div key={k.label} style={{ gridColumn: k.gc, gridRow: k.gr, background: k.bg, border: `1px solid ${k.bd}`, borderRadius: 24, boxShadow: 'var(--card-sh)', padding: 20, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: k.dot }} />{k.label}</span>
                <span style={{ marginTop: 'auto', fontFamily: SERIF, fontSize: k.size, lineHeight: 1, letterSpacing: '-.02em' }}>{k.value}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', textWrap: 'pretty' }}>{k.sub}</span>
                {k.note && <span style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--ink-2)', background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 999 }}>{k.note}</span>}
              </div>
            ))}
          </section>

          {/* Chart + outcomes */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <section style={{ ...card, flex: '2 1 480px', minWidth: 0, gap: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <h3 style={h3}>Calls per day</h3>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 999 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--bar-in)' }} />In hours</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 999 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--bar-after)' }} />After hours · desk closed</span>
                </div>
              </div>
              {empty ? (
                <div style={{ height: 210, borderRadius: 20, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Daily volume appears after the first call.</div>
              ) : (
                <div style={{ display: 'flex', gap: 10, height: 210 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', paddingBottom: 24, textAlign: 'right', width: 16 }}><span>{yMax}</span><span>{yMax / 2}</span><span>0</span></div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTop: '1px dashed var(--line-2)' }} />
                      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed var(--line-2)' }} />
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: '1px solid var(--line-2)' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: barGap }}>
                        {daily.map((d, i) => {
                          const hov = hover === i;
                          return (
                            <div key={i} className="bar-col" tabIndex={0} aria-label={`${d.long}: ${d.inh} in hours, ${d.aft} after hours`}
                              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} onFocus={() => setHover(i)} onBlur={() => setHover(-1)}
                              style={{ position: 'relative', flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2, outline: 'none', padding: '0 1px', borderRadius: 999, background: hov ? 'var(--surface-2)' : 'transparent' }}>
                              {d.aft > 0 && <div style={{ height: `${(d.aft / yMax) * 100}%`, background: 'var(--bar-after)', borderRadius: 999 }} />}
                              {d.inh > 0 && <div style={{ height: `${(d.inh / yMax) * 100}%`, background: 'var(--bar-in)', borderRadius: 999 }} />}
                              {hov && (
                                <div role="tooltip" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: `translateX(${i < n * 0.2 ? '-15%' : i > n * 0.8 ? '-85%' : '-50%'})`, zIndex: 5, background: 'var(--tip)', color: 'var(--tip-ink)', padding: '10px 12px', borderRadius: 14, fontSize: 12, whiteSpace: 'nowrap', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
                                  <strong>{d.long}</strong><span>{d.inh} in hours</span><span>{d.aft} after hours</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: barGap, height: 24, alignItems: 'flex-end', fontSize: 11, color: 'var(--ink-3)' }}>
                      {daily.map((d, i) => <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', whiteSpace: 'nowrap' }}>{(n - 1 - i) % step === 0 ? d.label : ''}</div>)}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section style={{ ...card, flex: '1 1 300px', minWidth: 0, gap: 16 }}>
              <h3 style={h3}>Outcomes</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 150, height: 150, flex: 'none' }}>
                  <svg viewBox="0 0 160 160" width="150" height="150" aria-hidden="true" style={{ display: 'block' }}>
                    <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
                    {segs.map((g) => single
                      ? <circle key={g.key} cx="80" cy="80" r={R} fill="none" stroke={g.color} strokeWidth="18" />
                      : <circle key={g.key} cx="80" cy="80" r={R} fill="none" stroke={g.color} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${Math.max(0.1, g.len - 12)} ${Cc}`} strokeDashoffset={-(g.off + 6)} transform="rotate(-90 80 80)" />)}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1 }}>{osum}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>calls</span>
                  </div>
                </div>
                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Object.keys(OUT).map((key) => (
                    <button key={key} className="h-out" title={OUT[key].hint} onClick={() => { setFilter(key); setNeeds(false); go('calls'); }} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12 }}>
                      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: OUT[key].color, color: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{OUT[key].icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{OUT[key].label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{ocounts[key]} <span style={{ fontWeight: 500, color: 'var(--ink-3)', fontSize: 12 }}>{pct(ocounts[key], osum)}</span></span>
                    </button>
                  ))}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', textWrap: 'pretty', padding: '12px 14px', borderRadius: 16, background: 'var(--surface-2)' }}>Nikhil's rubric: any failed criterion → not a fit. Unclear project, area or timeline → incomplete; front desk follows up.</p>
            </section>
          </div>

          {/* Funnel */}
          <section style={{ ...card, gap: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <h3 style={h3}>From ring to signed project</h3>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Each step as a share of the one before</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: mobile ? 8 : 24, alignItems: 'end' }}>
              {funnel.map((f) => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontFamily: SERIF, fontSize: mobile ? 24 : 34, lineHeight: 1 }}>{f.value}</div>
                  <div style={{ width: '100%', height: 170, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: 150, height: f.h, background: f.color, borderRadius: '999px 999px 18px 18px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{f.step}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Calls */}
          <section id="calls" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <h3 style={{ ...h3, fontSize: 32, lineHeight: 1.1 }}>Calls</h3>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{list.length} of {calls.length} recent calls · select one for the designer handoff</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', border: '1px solid var(--line-2)', borderRadius: 999, background: 'var(--surface)', flex: '0 1 300px', minWidth: 220 }}>
                <span aria-hidden="true" style={{ width: 13, height: 13, border: '1.5px solid var(--ink-3)', borderRadius: '50%', flex: 'none' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" aria-label="Search calls by name or number" style={{ border: 0, outline: 'none', background: 'transparent', font: 'inherit', color: 'var(--ink)', width: '100%' }} />
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {[['all', 'All'], ...Object.keys(OUT).map((k) => [k, OUT[k].label])].map(([key, label]) => {
                const a = filter === key;
                return (
                  <button key={key} aria-pressed={a} onClick={() => setFilter(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${a ? 'var(--ink)' : 'var(--line)'}`, background: a ? 'var(--ink)' : 'var(--surface)', color: a ? 'var(--bg)' : 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 600, padding: '0 14px', height: 38, borderRadius: 999, cursor: 'pointer' }}>
                    {label}<span style={{ fontWeight: 500, opacity: 0.7 }}>{cnt(key)}</span>
                  </button>
                );
              })}
              <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--line-2)', margin: '0 4px' }} />
              {[['After hours only', afterOnly, () => setAfterOnly(!afterOnly)], ['Needs action', needs, () => setNeeds(!needs)]].map(([label, a, on]) => (
                <button key={label} aria-pressed={a} onClick={on} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${a ? 'var(--accent)' : 'var(--line)'}`, background: a ? 'var(--accent-soft)' : 'var(--surface)', color: a ? 'var(--accent-text)' : 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 600, padding: '0 14px', height: 38, borderRadius: 999, cursor: 'pointer' }}>
                  <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid currentColor', display: 'grid', placeItems: 'center', fontSize: 9, lineHeight: 1 }}>{a ? '✓' : ''}</span>{label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'minmax(0,1fr)' : 'minmax(0,5fr) minmax(0,7fr)', gap: 16, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map((c) => {
                  const isSel = selC && c.id === selC.id;
                  const meta2 = [c.p.type, c.p.location].filter(Boolean).join(' · ') || (c.name ? c.phone : 'Unknown caller');
                  const select = () => { setSel(c.id); if (mobile) setTimeout(() => go('handoff'), 30); };
                  return (
                    <div key={c.id} className="h-row" role="button" tabIndex={0} aria-pressed={!!isSel} onClick={select} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } }}
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderRadius: 20, background: 'var(--surface)', border: `1px solid ${c.priceQuoted ? 'var(--bad)' : isSel ? 'var(--accent)' : 'var(--line)'}`, boxShadow: isSel ? 'var(--shadow)' : 'var(--card-sh)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.phone}</span>
                          {c.returning && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>↻ Returning</span>}
                        </span>
                        <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: PILL[c.cls][0], color: PILL[c.cls][1] }}><span aria-hidden="true">{OUT[c.cls].icon}</span>{OUT[c.cls].label}</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{meta2}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.reason}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12, color: 'var(--ink-2)' }}>
                        <span>{c.when}</span>
                        {c.after && <span style={{ fontWeight: 600, color: 'var(--accent-text)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 999 }}>◐ After hours</span>}
                        {c.priceQuoted && <span style={{ fontWeight: 700, color: 'var(--bad-text)', background: 'var(--bad-soft)', padding: '2px 8px', borderRadius: 999 }}>⚠ Price mentioned</span>}
                        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>{c.dur} · {inr(c.cost, 2)}</span>
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div style={{ padding: '44px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', borderRadius: 24, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}><div style={{ width: 20, height: 26, border: '1.5px solid var(--accent)', borderBottomWidth: 0, borderRadius: '999px 999px 4px 4px' }} /></div>
                    <div style={{ fontFamily: SERIF, fontSize: 22 }}>{calls.length ? 'No calls match' : 'No calls yet'}</div>
                    <div style={{ maxWidth: '40ch', color: 'var(--ink-2)', fontSize: 14, textWrap: 'pretty' }}>{calls.length ? 'Try clearing a filter, or search by the last four digits of the number.' : 'The receptionist is live and answering 24/7. Each call appears here within a minute of hanging up, with its handoff note.'}</div>
                  </div>
                )}
              </div>

              {selC && <Handoff c={selC} mobile={mobile} won={isWon(selC)} onToggleWon={() => toggleWon(selC)} txOpen={!!txOpen[selC.id]} onToggleTx={() => setTxOpen((s) => ({ ...s, [selC.id]: !s[selC.id] }))} />}
            </div>
          </section>

          {/* Cost & value */}
          <div id="money" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
            <section style={{ ...card, gap: 14 }}>
              <h3 style={h3}>What the system costs</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Voice + telephony (Vaani)', costs.voice, `${S.minutes.toLocaleString('en-IN')} min of calls`],
                  ['AI analysis (Gemini)', costs.ai, 'Classification + handoff extraction'],
                  ['Fixed (pro-rated)', costs.fixed, 'Hosting, email, calendar, CRM — free tiers'],
                ].map(([label, amount, note]) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '0 16px', padding: '12px 14px', borderRadius: 16, background: 'var(--surface-2)' }}>
                    <span style={{ fontWeight: 600 }}>{label}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{inr(amount, 2)}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{note}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, padding: '4px 4px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{empty ? '—' : `${inr(perCall, 2)} per call`}</span></div>
                <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1 }}>{inr(total, 2)}</span>
              </div>
            </section>
            <section style={{ ...card, gap: 14 }}>
              <h3 style={h3}>Value it's generating</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6 }}>
                {[
                  ['Qualified leads with a full handoff', S.handoffs_sent],
                  ['Calls that would have rung out after hours', S.after_hours],
                  ['Returning callers recognised', S.returning_callers],
                  ['Leads marked won', converted],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 14px', borderRadius: 16, background: 'var(--surface-2)' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.1 }}>{value}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 18px', borderRadius: 20, background: 'var(--accent-soft)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px 16px' }}>
                <span style={{ fontSize: 13, maxWidth: '26ch' }}>One won project (₹8–14 L) vs this period's cost</span>
                <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, color: 'var(--accent-text)' }}>{roi}</span>
              </div>
              {S.integration_errors > 0 && (
                <span style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--warn-text)', background: 'var(--warn-soft)', padding: '5px 12px', borderRadius: 999 }}>! {S.integration_errors} integration error{S.integration_errors > 1 ? 's' : ''} logged — see events table</span>
              )}
            </section>
          </div>

          {/* Existing clients */}
          <section id="clients" style={{ ...card, gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <h3 style={h3}>Existing clients</h3>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Calls from these numbers are recognised and complaints escalated.</span>
            </div>
            {clients.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clients.map((cl) => (
                  <div key={cl.phone} style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr auto' : '1.2fr 1fr 1.2fr 1fr auto', gap: '4px 16px', alignItems: 'center', padding: '10px 10px 10px 16px', borderRadius: 18, background: 'var(--surface-2)' }}>
                    <span style={{ fontWeight: 600 }}>{cl.name}</span>
                    <span style={{ color: 'var(--ink-2)' }}>{cl.phone}</span>
                    <span style={{ color: 'var(--ink-2)' }}>{cl.project}</span>
                    <span style={{ color: 'var(--ink-2)' }}>with {cl.designer}</span>
                    <button className="h-rm" onClick={() => onRemoveClient(cl.phone)} aria-label={`Remove ${cl.name}`} style={{ justifySelf: 'end', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', font: 'inherit', fontSize: 12, fontWeight: 600, height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer' }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); onAddClient(); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
              {[['phone', 'Phone'], ['name', 'Name'], ['project', 'Project'], ['designer', 'Designer']].map(([key, ph]) => (
                <input key={key} value={form[key]} required={key === 'phone' || key === 'name'} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={ph} aria-label={ph}
                  style={{ height: 44, border: '1px solid var(--line-2)', borderRadius: 999, background: 'var(--bg)', padding: '0 16px', font: 'inherit', color: 'var(--ink)', outlineColor: 'var(--accent)' }} />
              ))}
              <button type="submit" style={{ height: 44, border: 0, borderRadius: 999, background: 'var(--ink)', color: 'var(--bg)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Add client</button>
            </form>
          </section>

          <footer style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', padding: '4px 0 16px' }}>
            Internal · Aangan Studio, Pune · All times IST
            {mobile && (
              <form action={signOut} style={{ display: 'inline' }}> · <button type="submit" style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent-text)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Sign out</button></form>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}

function Handoff({ c, mobile, won, onToggleWon, txOpen, onToggleTx }) {
  const p = c.p;
  const pill = PILL[c.cls];
  const actions = [];
  if (c.booking) actions.push(c.booking.status === 'booked' ? ['◷', `Booked · ${c.booking.when}`, 'var(--ok-soft)', 'var(--ok-text)'] : ['◷', `Requested · ${c.booking.when}`, 'var(--warn-soft)', 'var(--warn-text)']);
  if (c.act.handoff) actions.push(['✉', 'Handoff sent', 'var(--surface-2)', 'var(--ink-2)']);
  if (c.act.esc) actions.push(['!', 'Escalated', 'var(--bad-soft)', 'var(--bad-text)']);
  if (c.act.crm) actions.push(['◆', 'CRM deal', 'var(--surface-2)', 'var(--ink-2)']);
  if (c.priceQuoted) actions.push(['⚠', 'Price mentioned', 'var(--bad-soft)', 'var(--bad-text)']);
  if (c.after) actions.push(['◐', 'After hours', 'var(--accent-soft)', 'var(--accent-text)']);

  const details = [
    ['Phone', c.phone],
    ['Area · scope', [p.area, p.scope].filter(Boolean).join(' · ') || (p.designer ? `Designer: ${p.designer}` : '—')],
    ['Timeline', p.timeline || '—'],
    ['Decision-maker', p.dm || '—'],
    ['Budget (volunteered)', p.budget || 'Not mentioned'],
    ['Language · mood', [p.lang, p.mood].filter(Boolean).join(' · ') || '—'],
    ['Booking', c.booking ? `${c.booking.when}${c.booking.site ? ' · site visit' : ''}` : 'None'],
  ];
  const passN = c.cr ? Object.values(c.cr).filter((v) => v === 'pass').length : 0;
  const tx = c.tx || [['Agent', 'No transcript captured (missed or dropped call).']];
  const more = tx.length > 5;

  return (
    <article id="handoff" style={{ position: mobile ? 'relative' : 'sticky', top: 20, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 28, boxShadow: 'var(--shadow)', padding: mobile ? '20px 16px' : 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)' }}>Designer handoff</span>
          <h4 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 30, lineHeight: 1.1 }}>{c.name || c.phone}</h4>
          <span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{c.when} IST · {c.dur} · {inr(c.cost, 2)}</span>
        </div>
        {c.cls === 'qualified' && (
          <button onClick={onToggleWon} aria-pressed={won} style={{ font: 'inherit', fontSize: 13, fontWeight: 700, height: 44, padding: '0 18px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${won ? 'var(--ok)' : 'var(--line-2)'}`, background: won ? 'var(--ok)' : 'transparent', color: won ? 'var(--surface)' : 'var(--ink)' }}>{won ? '✓ Won' : 'Mark won'}</button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ ...chip(pill[0], pill[1]), fontWeight: 700 }}><span aria-hidden="true">{OUT[c.cls].icon}</span>{OUT[c.cls].label}</span>
        {actions.map(([icon, label, bg, fg]) => <span key={label} style={chip(bg, fg)}><span aria-hidden="true">{icon}</span>{label}</span>)}
      </div>
      <p style={{ margin: 0, fontFamily: SERIF, fontSize: 20, lineHeight: 1.4, textWrap: 'pretty', padding: '18px 20px', borderRadius: 20, background: 'var(--surface-2)' }}>{c.summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 8 }}>
        {details.map(([k, v]) => (
          <div key={k} style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{k}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
      {c.cr && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <h5 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Five-criteria rubric</h5>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{passN} of 5 pass</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CRIT.map(([key, name]) => {
              const v = c.cr[key];
              const [icon, dot, bg, fg, label] = v === 'pass' ? ['✓', 'var(--ok)', 'var(--ok-soft)', 'var(--ok-text)', 'Pass'] : v === 'fail' ? ['✕', 'var(--bad)', 'var(--bad-soft)', 'var(--bad-text)', 'Fail'] : ['?', 'var(--warn)', 'var(--warn-soft)', 'var(--warn-text)', 'Unclear'];
              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) auto', gap: '2px 12px', alignItems: 'center', padding: '10px 14px 10px 10px', borderRadius: 16, background: 'var(--surface-2)' }}>
                  <span aria-hidden="true" style={{ gridRow: 'span 2', width: 30, height: 30, borderRadius: '50%', background: dot, color: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{icon}</span>
                  <span style={{ fontWeight: 600 }}>{name}</span>
                  <span style={{ gridRow: 'span 2', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: bg, color: fg }}>{label}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.ev?.[key]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {c.flags.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h5 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Flags</h5>
          {c.flags.map((fl) => (
            <div key={fl} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 16, background: 'var(--warn-soft)', fontSize: 13 }}><span aria-hidden="true" style={{ color: 'var(--warn-text)', fontWeight: 700 }}>⚑</span>{fl}</div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h5 style={{ margin: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>Transcript</h5>
          {more && <button onClick={onToggleTx} style={{ border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 12, fontWeight: 600, height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer' }}>{txOpen ? 'Collapse' : `Show all ${tx.length} lines`}</button>}
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: more && !txOpen ? 300 : 'none', overflow: 'hidden' }}>
          {tx.map(([who, text], i) => {
            const agent = who === 'Agent';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: agent ? 'flex-start' : 'flex-end', gap: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', padding: '0 10px' }}>{who}</span>
                <span style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: agent ? '6px 18px 18px 18px' : '18px 6px 18px 18px', background: agent ? 'var(--surface-2)' : 'var(--accent-soft)', fontSize: 13, textWrap: 'pretty' }}>{text}</span>
              </div>
            );
          })}
          {more && !txOpen && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, background: 'linear-gradient(transparent,var(--surface))' }} />}
        </div>
      </div>
    </article>
  );
}
