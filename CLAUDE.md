# Aangan Studio — 24/7 Phone Enquiry Agent
**Build brief for Claude Code.** Read this whole file before writing or changing code. It is the single source of truth for *why* we are building this, *what* we are building, and *what we must never build*.

Owner: Purvik Tulsiyan (founder's office, MESA Cohort C4, Case 03) · Client: Nikhil Deshpande, Founder, Aangan Studio, Pune

---

## 0. How to work on this project
1. **Plan before code.** A wrong plan takes 10 seconds to fix; wrong code takes 20 minutes. Before each step, state the plan in 3–6 bullets, then build.
2. **Name the layer** you are working in: Frontend · Backend · Database · API · Version Control.
3. **Never hard-code secrets.** All keys live in `.env.local` (git-ignored) locally and in Vercel → Settings → Environment Variables in production. Never print keys in logs or commit them.
4. **End every session with:** "Push my latest changes to GitHub."
5. Ask the user before: changing the stack, deleting data, or anything that quotes a price to callers (see §4 — that is forbidden).

---

## 1. The case in one page

**Aangan Studio** — interior design for homes and small offices in Pune. 60 people, 14 designers. Work sells itself via referrals and Instagram. The problem is what happens to enquiries.

| Number | Value |
|---|---|
| Enquiries / month | ~200 (phone, WhatsApp, web form) |
| No response within 48 hrs | ~48% (~96/month) |
| Answered < 1 hr vs next day | **4× conversion** |
| Arrive outside 10am–7pm | ~33% (~66/month) |
| Front desk | 2 people, 10am–7pm |
| Average project value | ₹8–14 lakh |

When an enquiry reaches a designer it is a forwarded message with no context — the designer's first call repeats the front desk's questions.

**Nikhil's ask (his words):** "Every enquiry must get answered in five minutes, day or night. The ones worth my designers' time should reach them with everything already asked. And the system should be able to quote our standard per-square-foot pricing so people don't have to wait for that."

**Scope of this build: incoming PHONE CALLS ONLY.** WhatsApp and web form are out of scope — design so they could plug in later (same pipeline, different trigger), but do not build them.

**Also required:**
- Designer handoff note via **Telegram or email** — we chose **email via Resend** (see §7 for the justification).
- A **dashboard** so Nikhil never pulls numbers manually again — including **what the system itself costs to run**.

---

## 2. Automation Brief — the Why

**Pain** — Aangan loses high-value clients to slow responses, not to quality of work. ~48% of enquiries unanswered for 48 hrs, 1/3 arrive after hours with nobody to pick up, a 4× conversion window is wasted, each lost lead is a potential ₹8–14 L project, and designers waste their first call re-asking questions.

**User** —
- Primary: prospective clients (homeowners, small-office owners) phoning the studio, often after hours.
- Secondary: 14 designers (receive the handoff note), 2 front-desk staff (freed from repetitive first calls).
- Owner: Nikhil (dashboard: volume, outcomes, cost).

**Outcome** —
- Every phone enquiry answered **instantly, 24/7** (target: unanswered-in-48-hrs ≈ 0%).
- Qualified callers get a **consultation booked during the call** with a calendar invite.
- Designer gets a **complete handoff note** — first call needs no repeated questions.
- Not-a-fit callers get an honest, polite answer immediately.
- Existing-client complaints escalated to a senior person within 15 minutes.
- Live dashboard of calls, outcomes, bookings, conversions and running cost.

### The Journey Today (phone)
| # | Step | What happens | Pain |
|---|---|---|---|
| 1 | Client calls | Found Aangan via referral/Instagram | — |
| 2a | In hours | One of 2 staff picks up if free | Busy/missed when both occupied |
| 2b | After hours (~33%) | Nobody answers, no voicemail (see T08) | Enquiry sits overnight |
| 3 | Waiting | Callback depends on someone noticing | ~48% no response in 48 hrs; T16 caller forgotten for days |
| 4 | Front desk qualifies | Asks scope, size, location, timeline | Manual, inconsistent, unrecorded |
| 5 | Forward to designer | Short forwarded message | No context |
| 6 | Designer's first call | Re-asks the same questions | Wasted time, frustrated client |
| 7 | Pricing | Client waits for designer | May go to a faster competitor |
| 8 | Nikhil tracks | Pulls numbers manually | No live visibility |

---

## 3. The Nine Checks

### 🛑 Kill switches (any No → don't build)
| # | Check | Answer | Evidence |
|---|---|---|---|
| 01 | Problem real? | **YES** | Nikhil's own data: ~48% unanswered in 48 hrs; 4× conversion if answered < 1 hr. |
| 02 | Workflow repeated? | **YES** | ~200 enquiries/month (~7/day), same first questions every time. |
| 03 | Input available? | **YES** | The caller's own answers + `services.md`, `qualified.md`, `pricing.md` + 40 real transcripts. |

### ⚖️ Sizing (any No → build smaller)
| # | Check | Answer | Evidence |
|---|---|---|---|
| 04 | Output valuable? | **YES** | Instant answer + booked consultation + designer-ready handoff note. |
| 05 | Impact measurable? | **YES** | Calls answered, after-hours calls caught, qualified %, bookings, conversions, cost per lead — all on the dashboard. |
| 08 | ROI worth it? | **YES** | One extra project/month = ₹8–14 L vs. a few thousand rupees of running cost. Sized down: phone only. |

### 🔒 Boundary (any No → put a human exactly here)
| # | Check | Answer | Evidence |
|---|---|---|---|
| 06 | Failure risk OK? | **YES for answering/qualifying · NO for pricing** | A bad qualification is recoverable. A spoken price on a ₹8–14 L project becomes a commitment; `pricing.md` says "No number from this guide should be quoted to a client." |
| 07 | Judgment protected? | **YES** | The AI extracts facts; **Nikhil's rubric (code in `lib/rules.js`) decides**; uncertainty on budget/decision-maker is flagged for the designer; the designer decides fit at consultation and owns the quote. |
| 09 | Owner clear? | **YES** | Nikhil owns the system + rubric. Designer owns the client + quote after handoff. Front desk owns follow-up on incomplete calls. Nikhil/senior owns existing-client escalations. |

### ✂️ The Cut
**Auto-quoting per-sq-ft pricing — killed by Check 06 (Failure risk), reinforced by 07 (Judgment).** Nikhil asked for it; his own pricing guide forbids it ("indicative only… No number should be quoted… confirmed by the assigned designer at the consultation").
**Replacement (human placed exactly here):** the agent collects everything a quote needs (carpet area, rooms, scope, location, current state) and says only the approved line (§4). The designer quotes at the consultation with full context. The dashboard flags any call where the agent mentioned a price (compliance check).

---

## 4. Non-negotiable rules for the agent and the code
1. **Never quote a price.** No number, range, per-sq-ft rate, "starting from…", "typically for a 2BHK…". The only allowed response:
   > "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like."
   If pushed again: "The consultation is free and there's no obligation."
2. **Never ask about budget.** Only react if the caller volunteers a clearly-too-low number.
3. **The rubric decides, not the model.** Gemini extracts `pass | fail | unclear` per criterion; `lib/rules.js` applies Nikhil's rules.
4. Asking for price, calling at night, renting, single-room projects, not knowing what they want **do not disqualify**.
5. Existing-client complaints: apologise, don't solve, collect details, promise a senior callback within 15 min, escalate immediately.
6. Never invent facts about the studio, designers or projects.

---

## 5. Source files — what each one is for

Put these in `knowledge/` (already there if you received the starter project).

| File | What it is | How the build uses it |
|---|---|---|
| `knowledge/services.md` | What Aangan does / doesn't do, service area (Pune + PCMC localities), project types, timelines (design 3–4 wks, execution 8–16 wks, no projects needed in < 6 wks) | Agent's knowledge for answering scope questions; Gemini prompt for checking service area / scope |
| `knowledge/qualified.md` | **Nikhil's rubric** — the 5 criteria, boundary rules, what does NOT disqualify | Encoded in `lib/rules.js` + agent prompt + Gemini prompt. This is Nikhil's judgment — don't override it |
| `knowledge/pricing.md` | Internal indicative rates + "agent must never say" list + the only allowed pricing line | **Rates are NEVER exposed to the agent or caller.** Only the deflection script is used. Evidence for The Cut |
| `Aangan_Sep 2026_Enquiries.pdf` | 40 real anonymised enquiries (20 phone, 10 WhatsApp, 10 web form) from Sept 2026 | **Context only — not test data.** Shows how real callers talk and what they ask. Use to design the prompt and to write *new* synthetic test calls |
| `MESA_Case 03_Problem Statement.pdf` | The case brief | Source of the numbers, the ask and the scope |
| `agent/system-prompt.md` | The voice agent's instructions (built from the 3 knowledge files) | Paste into Vaani Labs |

### Patterns from the September phone calls the agent must handle
| Pattern | Example | Expected behaviour |
|---|---|---|
| Clean qualified lead | T01, T05, T06, T11, T12, T15, T17, T20 | Collect details → book → handoff |
| Pushes for price, repeatedly | T02, T13 | Deflection script every time → book |
| Outside service area | T03 (Nashik) | Decline: no vendor network outside Pune |
| Advice only | T04 | Explain design+execution minimum; leave door open |
| Timeline too short | T07 (Diwali in 3 wks) | Be honest; offer a later start |
| Volunteered budget clearly too low | T10 (₹1–1.5 L) | Address gently; **don't forward** |
| Rented flat | T11 | Fine if no structural changes |
| Calling for parents | T14 | Fine if owners attend consultation; flag decision-maker |
| Out-of-scope type / too small | T18 (180 sq ft pod), T19 (restaurant) | Decline; suggest a specialist |
| **Existing-client complaint** | T09 | **Escalate** to Nikhil/senior, 15-min callback |
| Missed after-hours call | T08 (10:47 pm, no voicemail) | The gap this system closes |
| Repeat caller / dropped call | T16, T17 | Recognise by phone number; log every call |
| Hinglish | W03 | Reply in the caller's language |

### Assumptions where the source files conflict (tell Nikhil)
- **Timeline:** `services.md` says < 6 weeks impossible; `qualified.md` and the front desk say 8–10 weeks. **We use: needs completion in < ~8 weeks → fails timeline.**
- **Commercial minimum ~500 sq ft:** said by front desk (T18), not in `services.md`. **We treat < 500 sq ft commercial as not a fit.**
- **Existing-client complaints:** not covered by any file. **We escalate by email to `ESCALATION_EMAIL`.**

---

## 6. Components Map (Trigger → Input → Context → Processing → Output)

Lanes (actors) × stages. Numbers = order of steps.

| Lane | Trigger | Input | Context | Processing | Output |
|---|---|---|---|---|---|
| **Caller** | 1. Dials studio number, any hour | 3. Describes project (type, location, size, scope, timeline; budget only if volunteered) | | | 11. Gets booked slot + calendar invite, or an honest "not a fit" |
| **Vaani Labs** (voice AI) | 2. Answers in seconds, 24/7 | 4. Asks rubric questions; one direct question if criteria 1–3 unclear | | 7. Applies rubric live; price asked → deflection script | 9. Books slot in-call or declines gracefully |
| **Knowledge base** (built in Claude Chat) | | | 5. services + qualified + pricing script as agent instructions | | |
| **Gemini Flash** | | | | 8. Post-call: classifies intent, extracts handoff fields, scores 5 criteria, compliance check | |
| **Neon** | | | 6. Lookup caller: returning? existing client? | 10. Log call, outcome, cost | |
| **Cal.com** | | | Designer availability | | 9a. Consultation booked; invite to caller + designer |
| **HubSpot** | | | | | 12. Qualified call → contact + deal |
| **Resend (email)** | | | | | 13. Handoff note to designer · 13b. Urgent escalation alert |
| **Designer / Nikhil** | | | | | 14. First call with full context; owns the quote · senior callback for escalations |
| **Dashboard (Vercel)** | | | | | 15. Calls, after-hours caught, qualified %, bookings, conversions, running cost |

Flow: `1→2→4⇄3 → 7 ← (5, 6, calendar) → 9 → 9a → 11` and `7 → 8 → 10 → 15`, `8 → 12, 13 → 14`, `8 → 13b → Nikhil`.

Patterns: humans at the edges (caller starts, designer/Nikhil finish); AI only in the middle; the app is the hub; infrastructure clusters under Processing.

---

## 7. The Stack (decided)

| Tool | Role | Notes |
|---|---|---|
| Claude Chat | Built the qualification logic / agent prompt | `agent/system-prompt.md` |
| Claude Code | Where the project is built end-to-end | You |
| **Vaani Labs** | Telephony + voice + call orchestration | Configure agent: system prompt, 3 tools, post-call webhook |
| **Gemini Flash** (`gemini-2.5-flash`) | Post-call classification + extraction | Cheap, fast; structured JSON output |
| **Cal.com** (free) | Book consultation inside the call | API v2: `/v2/slots` (cal-api-version `2024-09-04`), `/v2/bookings` (`2024-08-13`) |
| **Resend** (email) | Designer handoff + escalation | Chosen over Telegram: designers already live in email, the note is long and structured (tables), it's searchable/forwardable, sits with the calendar invite, no bot setup per designer. Telegram would win only for instant phone alerts — escalations could move there later |
| **HubSpot** (free CRM) | Qualified calls become deals | Optional; skipped if `HUBSPOT_TOKEN` not set |
| **Neon** (Postgres) | Call log + state | `@neondatabase/serverless` (HTTP driver) |
| **Vercel** | Hosts API routes + dashboard | Next.js 15 App Router, Node runtime |
| **GitHub** | Version control | Private repo `aangan-voice-agent` |

---

## 8. The Solution — architecture

```
Caller ──phone──▶ Vaani Labs agent (system-prompt.md)
                    │  during call (tools, HTTPS + x-aangan-secret):
                    ├─▶ POST /api/tools/lookup-caller   → Neon: existing client? returning?
                    ├─▶ POST /api/tools/availability    → Cal.com slots (offer 2)
                    └─▶ POST /api/tools/book            → Cal.com booking + event in Neon
                    │  after call:
                    └─▶ POST /api/vaani/webhook (transcript, from, duration, cost)
                           → lib/pipeline.js
                              1. normalise payload (tolerant of Vaani field names)
                              2. caller context from Neon
                              3. Gemini Flash → structured JSON (lib/gemini.js)
                              4. Nikhil's rubric → classification (lib/rules.js)
                              5. attach booking made during the call
                              6. upsert row in `calls` (idempotent on call_id)
                              7. qualified → HubSpot deal + Resend handoff email
                                 existing_client → Resend escalation email
                                 price mentioned → compliance flag
Dashboard  GET /  (password-protected) → reads Neon
Health     GET /api/health → env + DB check
```

### Classification (lib/rules.js — Nikhil's rubric)
- `existing_client` → escalate.
- `other` → spam / vendor / wrong number.
- Any criterion `fail` → `not_fit` (don't forward).
- Criteria 1–3 (`real_project`, `service_area`, `timeline`) `unclear` → `incomplete` (front desk follows up).
- Otherwise → `qualified`; `unclear` on budget/decision-maker is noted in the handoff.
- Transcript < 40 chars (dropped call) → `incomplete`.

### Database (db/schema.sql)
- `calls` — one row per call: caller, time, duration, after_hours (IST 10–7), transcript, classification, reason, summary, criteria (jsonb), project (jsonb), flags, pricing_asked, price_quoted, booking, hubspot_deal_id, handoff_sent, escalation_sent, converted, cost_voice_inr, cost_ai_inr.
- `clients` — existing clients by phone (Nikhil adds them) → escalation recognition.
- `events` — audit: bookings, handoffs, escalations, errors.

### Dashboard (app/page.js)
7/30/90-day toggle. Tiles: calls (% answered), after-hours calls caught, qualified leads, consultations booked (+ conversions), escalations, running cost (per call, per qualified lead). Charts: calls per day (in-hours vs after-hours), outcome breakdown. Cost table (voice, AI, fixed) and value table (qualified pipeline ₹8–14 L × leads). Recent calls table. Red banner if any call has `price_quoted`.

### Cost model
- Voice: Vaani's per-call cost if the webhook sends it, else `ceil(duration/60) × VAANI_COST_PER_MIN_INR`.
- AI: Gemini tokens × price (env `GEMINI_PRICE_IN_PER_M`, `GEMINI_PRICE_OUT_PER_M`, `USD_INR`).
- Fixed: `FIXED_MONTHLY_COST_INR` pro-rated. Free tiers: Neon, Vercel, Resend, Cal.com, HubSpot.

---

## 9. Project structure (starter code already written and compiles — review, then test)
```
agent/system-prompt.md          Vaani agent instructions
knowledge/{services,qualified,pricing}.md
db/schema.sql                   tables
scripts/migrate.mjs             npm run db:migrate
lib/db.js                       Neon (or PGlite when DATABASE_URL=pglite for tests)
lib/gemini.js                   analyseCall() + cost
lib/rules.js                    Nikhil's rubric, IST helpers
lib/pipeline.js                 end-of-call pipeline
lib/calendar.js                 Cal.com slots + booking
lib/notify.js                   Resend handoff + escalation emails
lib/hubspot.js                  contact + deal
lib/auth.js                     WEBHOOK_SECRET check
app/api/vaani/webhook/route.js
app/api/tools/{lookup-caller,availability,book}/route.js
app/api/health/route.js
app/page.js + globals.css       dashboard
middleware.js                   dashboard password
.env.example                    all variables
```

### Environment variables
`DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, RESEND_API_KEY, EMAIL_FROM, HANDOFF_EMAIL, ESCALATION_EMAIL, CALCOM_API_KEY, CALCOM_USERNAME, CALCOM_EVENT_SLUG, HUBSPOT_TOKEN (optional), WEBHOOK_SECRET, DASHBOARD_PASSWORD, VAANI_COST_PER_MIN_INR, FIXED_MONTHLY_COST_INR, USD_INR`

Resend note: until a domain is verified, Resend can only send **from** `onboarding@resend.dev` **to** the Resend account owner's email → set `HANDOFF_EMAIL` to that email for the demo.

---

## 10. Build order for Claude Code
1. `npm install` → confirm `.env.local` has DATABASE_URL, GEMINI_API_KEY, RESEND_API_KEY.
2. **Database:** `npm run db:migrate` → confirm tables `calls, clients, events`. (If the connection is blocked, paste `db/schema.sql` into Neon → SQL Editor.)
3. **Tests:** write `tests/run-pipeline.mjs` with ~8 *new synthetic* phone transcripts (not the September ones) covering: qualified, price-pusher, out of area, advice only, too-short timeline, low volunteered budget, existing-client complaint, dropped call. Run against PGlite (`DATABASE_URL=pglite`) with Gemini **real** if reachable, else a mocked fetch. Assert the classification for each.
4. **Gemini live check:** one real transcript through `analyseCall()` — confirm JSON + token usage.
5. **Resend live check:** send one test handoff email to `HANDOFF_EMAIL`.
6. **Git + GitHub:** init, commit, create private repo `aangan-voice-agent`, push. Verify `.env.local` is NOT in the repo.
7. **Vercel:** import repo, add all env vars, deploy, open `/api/health` → all green.
8. **Cal.com:** create event type `consultation` (60 min, Asia/Kolkata), API key → env; test `/api/tools/availability`.
9. **Vaani Labs:** create agent → paste `agent/system-prompt.md` → add 3 tools (`lookup_caller`, `check_availability`, `book_consultation`) pointing to the Vercel URLs with header `x-aangan-secret` → post-call webhook to `/api/vaani/webhook` → buy/assign a number → test call. Adjust `normalizePayload()` to Vaani's actual webhook fields.
10. **HubSpot (optional):** private app with `crm.objects.contacts.write` + `crm.objects.deals.write` → `HUBSPOT_TOKEN`.
11. End-to-end: place 3 calls (qualified, not a fit, existing client) → check email, calendar, HubSpot, dashboard.
12. Push to GitHub.

## 11. Definition of done
- [ ] A call at any hour is answered by the agent.
- [ ] The agent never states a price (test by pushing 3 times).
- [ ] A qualified call ends with a booking + calendar invite + handoff email that contains every detail asked.
- [ ] Not-a-fit callers are declined politely with the reason.
- [ ] An existing-client complaint sends an urgent escalation email.
- [ ] Dashboard shows calls, after-hours caught, outcomes, bookings, cost per lead.
- [ ] No secrets in GitHub. Code pushed.

## 12. Later (out of scope — note only)
WhatsApp Business API and the web form feed the **same** `processCall()` pipeline: only the Trigger and Input lanes change. Telegram for escalation alerts. A `converted` toggle on the dashboard (or HubSpot deal-won sync) to measure true conversion against the 4× baseline.
