// Nikhil's rubric (knowledge/qualified.md) as code.
// Gemini only EXTRACTS facts and marks each criterion pass | fail | unclear.
// This file DECIDES. Change behaviour here, not in the prompt.

export const CRITERIA = ['real_project', 'service_area', 'timeline', 'budget', 'decision_maker'];
export const CORE = ['real_project', 'service_area', 'timeline']; // unclear → ask / follow up
export const SOFT = ['budget', 'decision_maker'];                 // unclear → qualified + flag

export const CRITERIA_LABELS = {
  real_project: 'Real project (design + execution)',
  service_area: 'In service area (Pune / PCMC)',
  timeline: 'Realistic timeline',
  budget: 'Budget band (only if volunteered)',
  decision_maker: 'Decision-maker on the call',
};

// Assumptions where the source files conflict (see CLAUDE.md §5).
export const MIN_WEEKS_TO_COMPLETE = 8;     // < ~8 weeks to completion → fails timeline
export const MIN_COMMERCIAL_SQFT = 500;     // front desk practice (T18)
export const MAX_COMMERCIAL_SQFT = 3000;    // services.md "up to approximately"

// Places services.md names as outside the area. Backstop only; Gemini judges the rest.
const OUT_OF_AREA = ['talegaon', 'lonavala', 'nashik', 'mumbai', 'navi mumbai', 'thane', 'satara', 'nagpur', 'bangalore', 'bengaluru', 'goa', 'kolhapur', 'aurangabad'];
const OUT_OF_SCOPE_TYPES = ['restaurant', 'cafe', 'hotel', 'retail', 'shop', 'store', 'gym', 'hospitality', 'bar', 'salon'];

// "Clearly below" floor for a VOLUNTEERED budget: half of the lowest indicative
// rate in pricing.md. Internal only — never spoken, never sent to the voice agent.
const FLOOR_PER_SQFT = { residential: 900, commercial: 600 };
const SINGLE_ROOM_FLOOR = 175000; // half of the lowest single-room figure

/** Apply deterministic backstops on top of the model's per-criterion read. */
export function applyBackstops(analysis) {
  const a = structuredClone(analysis);
  a.criteria ??= {};
  for (const c of CRITERIA) a.criteria[c] ??= { status: 'unclear', evidence: '' };
  const p = a.project ?? {};
  const set = (c, status, evidence) => { a.criteria[c] = { status, evidence: `${evidence} [rule]` }; };

  const loc = `${p.location ?? ''}`.toLowerCase();
  const hit = OUT_OF_AREA.find((x) => loc.includes(x));
  if (hit) set('service_area', 'fail', `Site in ${p.location} — outside Pune/PCMC`);

  const kind = `${p.property_type ?? ''} ${p.subtype ?? ''}`.toLowerCase();
  const badType = OUT_OF_SCOPE_TYPES.find((x) => new RegExp(`\\b${x}`).test(kind));
  if (badType) set('real_project', 'fail', `${badType} projects are out of scope (services.md)`);

  const area = Number(p.carpet_area_sqft) || null;
  if (p.property_type === 'commercial' && area && area < MIN_COMMERCIAL_SQFT) {
    set('real_project', 'fail', `${area} sq ft commercial is below the ~${MIN_COMMERCIAL_SQFT} sq ft minimum`);
  }

  const weeks = Number(p.weeks_until_completion_needed);
  if (Number.isFinite(weeks) && weeks > 0 && weeks < MIN_WEEKS_TO_COMPLETE && !p.flexible_on_timeline) {
    set('timeline', 'fail', `Needs completion in ~${weeks} weeks; design + execution needs ${MIN_WEEKS_TO_COMPLETE}+`);
  }

  const budget = Number(p.budget_volunteered_inr) || null;
  if (budget) {
    let floor = null;
    if (p.scope_level === 'single_room') floor = SINGLE_ROOM_FLOOR;
    else if (area) floor = area * (FLOOR_PER_SQFT[p.property_type] ?? FLOOR_PER_SQFT.residential);
    if (floor && budget < floor) {
      set('budget', 'fail', `Volunteered ₹${budget.toLocaleString('en-IN')} is clearly below this scope`);
    }
  } else if (a.criteria.budget.status === 'fail' && !p.budget_volunteered_text) {
    // Never fail budget unless the caller actually volunteered a number.
    set('budget', 'unclear', 'Budget not volunteered — treat as qualified');
  }
  if (!budget && !p.budget_volunteered_text && a.criteria.budget.status === 'unclear') {
    a.criteria.budget = { status: 'pass', evidence: 'Not mentioned — treated as qualified (qualified.md)' };
  }
  return a;
}

/**
 * Classify a call.
 * @returns {{classification: string, reason: string, flags: string[]}}
 */
export function classify(analysis, transcript) {
  if (!transcript || transcript.replace(/\s+/g, ' ').trim().length < 40) {
    return { classification: 'incomplete', reason: 'Call dropped or too short to qualify — front desk to call back', flags: ['Dropped / very short call'] };
  }
  const intent = analysis?.intent;
  if (intent === 'existing_client') {
    return { classification: 'existing_client', reason: 'Existing client — escalate to Nikhil / senior for a 15-minute callback', flags: ['Existing-client issue'] };
  }
  if (intent === 'other') {
    return { classification: 'other', reason: analysis?.other_reason || 'Not a project enquiry (vendor, job, wrong number, spam)', flags: [] };
  }

  const crit = analysis.criteria;
  const fails = CRITERIA.filter((c) => crit[c]?.status === 'fail');
  const unclearCore = CORE.filter((c) => crit[c]?.status === 'unclear');
  const unclearSoft = SOFT.filter((c) => crit[c]?.status === 'unclear');
  const flags = unclearSoft.map((c) => `Unclear: ${CRITERIA_LABELS[c]} — ${crit[c]?.evidence || 'not established on the call'}`);

  if (fails.length) {
    return {
      classification: 'not_fit',
      reason: fails.map((c) => `${CRITERIA_LABELS[c]}: ${crit[c].evidence}`).join(' · '),
      flags,
    };
  }
  if (unclearCore.length) {
    return {
      classification: 'incomplete',
      reason: `Could not establish: ${unclearCore.map((c) => CRITERIA_LABELS[c]).join(', ')} — front desk to follow up`,
      flags,
    };
  }
  return { classification: 'qualified', reason: 'Passes all five criteria', flags };
}

// ---------- compliance: did the AGENT say a price? ----------
const MONEY = /(?:₹|\brs\.?|\binr)\s?(\d[\d,.]*)|(\d[\d,.]*)\s*(?:-|to|–)?\s*(?:\d[\d,.]*\s*)?(?:lakh|lakhs|lac|lacs|crore|k)\b|(\d[\d,.]*)\s*(?:rupees\s*)?(?:per|\/)\s*(?:sq|square)/gi;
const AGENT_LINE = /^\s*(agent|assistant|bot|ai|vaani|aanya)\s*:/i;
const digits = (s) => `${s ?? ''}`.replace(/[^\d.]/g, '').replace(/\.$/, '');

/**
 * Agent lines only (transcript lines prefixed "Agent:" / "Caller:").
 * A money figure the agent says counts as a quote unless the caller said that
 * same figure first (e.g. gently echoing a volunteered budget).
 */
export function agentQuotedPrice(transcript = '') {
  const lines = transcript.split('\n');
  const callerFigures = new Set();
  for (const l of lines) {
    if (AGENT_LINE.test(l)) continue;
    for (const m of l.matchAll(/\d[\d,.]*/g)) callerFigures.add(digits(m[0]));
  }
  return lines.filter((l) => AGENT_LINE.test(l)).some((l) => {
    if (/\b(start(s|ing)?)\s+(at|from)\s+(₹|rs|\d)/i.test(l)) return true;
    for (const m of l.matchAll(MONEY)) {
      const fig = digits(m[1] ?? m[2] ?? m[3]);
      if (fig && !callerFigures.has(fig)) return true;
    }
    return false;
  });
}

// ---------- time helpers (IST) ----------
export function istParts(date) {
  const d = new Date(date);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: parts.weekday };
}

/** Front desk is 10am–7pm IST on working days ("closed over the weekend", W05). */
export function isAfterHours(date) {
  const { hour, weekday } = istParts(date);
  return weekday === 'Sat' || weekday === 'Sun' || hour < 10 || hour >= 19;
}

export function formatIST(date, opts = {}) {
  return new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, ...opts });
}

/** Normalise any Indian phone format to the last 10 digits. */
export function normPhone(p) {
  const digits = `${p ?? ''}`.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}
