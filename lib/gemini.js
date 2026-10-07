// Post-call analysis with Gemini Flash: classify intent, extract the handoff
// fields, read each rubric criterion as pass | fail | unclear, compliance check.
// The model extracts; lib/rules.js decides.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const kb = (f) => readFileSync(path.join(process.cwd(), 'knowledge', f), 'utf8');

const status = { type: 'object', properties: { status: { type: 'string', enum: ['pass', 'fail', 'unclear'] }, evidence: { type: 'string' } }, required: ['status', 'evidence'] };
const str = { type: 'string', nullable: true };
const num = { type: 'number', nullable: true };

const SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['new_enquiry', 'existing_client', 'other'] },
    other_reason: str,
    caller_name: str,
    caller_email: str,
    language: { type: 'string' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'frustrated', 'angry'] },
    summary: { type: 'string' },
    project: {
      type: 'object',
      properties: {
        property_type: { type: 'string', enum: ['residential', 'commercial', 'other', 'unknown'] },
        subtype: str,                 // 3BHK apartment, villa, office, clinic, restaurant...
        location: str,                // locality + city
        carpet_area_sqft: num,
        scope_level: { type: 'string', enum: ['full_home', 'partial_home', 'single_room', 'office_fitout', 'advice_only', 'unknown'] },
        rooms_scope: str,             // kitchen, wardrobes, living room...
        current_state: str,           // bare shell, builder flat, lived-in...
        ownership: str,               // owner, rented (landlord ok?), for parents...
        structural_changes_requested: { type: 'boolean' },
        timeline_text: str,
        weeks_until_completion_needed: num,
        flexible_on_timeline: { type: 'boolean' },
        budget_volunteered_text: str,
        budget_volunteered_inr: num,
        decision_maker: str,
        referral_source: str,
        style_notes: str,
        site_visit_requested: { type: 'boolean' },
        preferred_times: str,
      },
      required: ['property_type', 'scope_level', 'structural_changes_requested', 'flexible_on_timeline', 'site_visit_requested'],
    },
    criteria: {
      type: 'object',
      properties: { real_project: status, service_area: status, timeline: status, budget: status, decision_maker: status },
      required: ['real_project', 'service_area', 'timeline', 'budget', 'decision_maker'],
    },
    pricing_asked: { type: 'boolean' },
    price_quoted_by_agent: { type: 'boolean' },
    price_quote_evidence: str,
    existing_client: {
      type: 'object', nullable: true,
      properties: { project_details: str, designer_name: str, complaint: str, callback_preference: str },
    },
    open_questions_for_designer: { type: 'array', items: { type: 'string' } },
  },
  required: ['intent', 'language', 'sentiment', 'summary', 'project', 'criteria', 'pricing_asked', 'price_quoted_by_agent', 'open_questions_for_designer'],
};

function buildPrompt(transcript, ctx) {
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' });
  return `You analyse phone calls answered by the AI receptionist of Aangan Studio, an interior design studio in Pune.
Today is ${today} (IST). Read the transcript and return JSON matching the schema. Extract facts only — never invent details that were not said. Use null when something was not said.

# What the studio does
${kb('services.md')}

# Nikhil's rubric — mark each criterion
${kb('qualified.md')}

# How to mark criteria
- real_project: pass if they want design + execution (full home, partial, single room with execution, office fitout). fail if advice/ideas/decor only, standalone furniture or Vastu only, structural/architecture work, or an out-of-scope type (restaurant, hotel, retail, gym), or commercial under ~500 sq ft. unclear if not established.
- service_area: pass if the site is in Pune city or PCMC (localities listed above and adjoining Pune areas). fail for Talegaon, Lonavala, Nashik, Mumbai or any other city. unclear if location never said.
- timeline: fail only if they need the project COMPLETE in under ~8 weeks and are not willing to move it. pass if the timeline is 8+ weeks away, flexible, or they agreed to a later start. unclear if never discussed. Fill weeks_until_completion_needed as weeks from today to when they need it complete (null if unknown).
- budget: never penalise for not mentioning budget (status "pass", evidence "not mentioned"). fail ONLY if the caller volunteered a number that is clearly far below what that scope would cost (e.g. ₹1–1.5 lakh for a kitchen + bedroom). unclear if they hinted at a tight budget without a number.
- decision_maker: pass if the caller decides or is authorised (spouse knows and agrees; parents will attend the consultation). unclear if they are only researching for someone else with no authorisation. fail only if they say clearly they have no say and the owners won't engage.
- Asking for price, calling at night, renting (with no structural changes), a single-room project, or not knowing what they want do NOT disqualify.

# Intent
- existing_client: the caller already has a project with Aangan (complaint, follow-up, delay, their designer's name). Fill existing_client.
- other: vendors, job seekers, sales calls, wrong numbers, spam, silence.
- new_enquiry: everything else.

# Compliance
- pricing_asked: the caller asked about cost/rates/budget range.
- price_quoted_by_agent: true if the AGENT (not the caller) stated or confirmed any cost figure, range, per-sq-ft rate, "starting from", or "typically costs" for Aangan's work. Referring back to a budget the caller volunteered ("that budget would be below what this scope costs") is NOT a quote. Quote the offending line in price_quote_evidence.

# Handoff
- summary: 2–3 sentences a designer can read before calling back — who, what, where, when, anything sensitive (frustration, repeat caller).
- open_questions_for_designer: only things NOT answered on the call that the designer will need (e.g. "Budget not discussed", "Confirm parents will attend").
- language: the language the caller mainly used (English, Hindi, Hinglish, Marathi...).

# Caller context from our records
${JSON.stringify(ctx ?? {}, null, 0)}

# Transcript
${transcript}`;
}

/** Price per 1M tokens in USD (env-overridable) → INR. Thinking tokens bill as output. */
export function aiCostInr(tokensIn, tokensOut) {
  const pin = Number(process.env.GEMINI_PRICE_IN_PER_M ?? 0.3);
  const pout = Number(process.env.GEMINI_PRICE_OUT_PER_M ?? 2.5);
  const fx = Number(process.env.USD_INR ?? 88);
  return ((tokensIn * pin + tokensOut * pout) / 1e6) * fx;
}

/**
 * @returns {Promise<{analysis: object, usage: {in: number, out: number}, costInr: number, model: string}>}
 */
export async function analyseCall(transcript, ctx = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(transcript, ctx) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
  // Extraction doesn't need deep reasoning: low thinking = faster + cheaper.
  const level = process.env.GEMINI_THINKING_LEVEL ?? 'low';
  if (level && level !== 'off') body.generationConfig.thinkingConfig = { thinkingLevel: level };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        const err = new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
        if (res.status === 400 && /thinking/i.test(t) && body.generationConfig.thinkingConfig) {
          delete body.generationConfig.thinkingConfig; // model doesn't support it — retry without
          continue;
        }
        if (res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
      const analysis = JSON.parse(text);
      const u = json.usageMetadata ?? {};
      const tin = u.promptTokenCount ?? 0;
      const tout = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
      return { analysis, usage: { in: tin, out: tout }, costInr: aiCostInr(tin, tout), model };
    } catch (err) {
      lastErr = err;
      if (err.fatal) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}
