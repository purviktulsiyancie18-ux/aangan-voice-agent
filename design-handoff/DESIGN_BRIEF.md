# Design brief: Aangan Studio phone-enquiry dashboard

**Paste this whole file into Claude Design.** Attach `01-current-overview.jpg`, `02-current-calls-expanded.jpg` and `sample-data.json`.

---

## What I need
Redesign the interface, look and feel of an existing internal dashboard. Keep every piece of information it shows today, and make it feel like a premium interior-design studio's own tool rather than a generic admin panel. Give me a high-fidelity desktop design (1280–1440 px wide) and a mobile layout (390 px), in both light and dark mode.

The current version (screenshots attached) works but is plain, dense and dark-only. Treat it as the content inventory, not as a layout to keep.

## Context
- **Aangan Studio** is an interior design studio in Pune (homes and small offices, 14 designers, average project ₹8–14 lakh).
- An AI voice receptionist answers **every** enquiry call, 24/7. After each call, the system:
  - classifies the caller with the founder's rubric
  - books a consultation
  - emails the designer a handoff note
  - escalates complaints from existing clients
- **The user is Nikhil Deshpande, the founder.** He opens this page a few times a week, often on his phone, to answer three questions:
  1. Is every enquiry getting answered, including at night?
  2. How many good leads reached my designers, and did they book or convert?
  3. What does this system cost me, and is it worth it?
- Before this system existed, about 48% of enquiries went unanswered for 48 hours and about 33% arrived after hours with nobody to pick up. Answering within an hour converts 4× better. The dashboard should make that before-and-after obvious.

## Content to include (all of it, re-prioritised as you see fit)

1. **Header:** title, the last-updated time in IST, and a 7 / 30 / 90-day range switch.
2. **Status banners:**
   - **Pricing compliance:** green "No price quoted on any call · N callers asked about price and were offered a consultation", or red if `price_quoted > 0`. This matters a lot: the agent must never quote a price.
   - **Escalations:** red "N existing-client escalations — senior callback within 15 min" when there are any.
3. **KPIs:**
   - calls answered (and % of calls, against the old 48%-unanswered baseline)
   - after-hours calls caught (%)
   - qualified leads (% of calls, handoff notes sent)
   - consultations booked (confirmed in calendar, won)
   - running cost (₹ per call, ₹ per qualified lead)
   - pipeline sent to designers (₹ lakh range = qualified × 8–14 L)
4. **Calls per day:** in-hours versus after-hours (front desk closed) over the selected range.
5. **Outcome breakdown:**
   - Qualified
   - Not a fit
   - Incomplete (front desk follows up)
   - Existing client (escalated)
   - Other (spam, vendors)
6. **Funnel (new, nice to have):** calls → qualified → booked → won.
7. **Cost table:** voice and telephony (Vaani), AI analysis (Gemini), fixed costs, and the total.
8. **Value table:**
   - qualified leads with a full handoff
   - calls that would have rung out after hours
   - returning callers recognised
   - leads marked won
   - one won project compared with this period's cost
9. **Calls list:** the most important working area.
   - **Each row:** when (IST, with an after-hours tag), caller name or number, project type and location, a one-line reason, an outcome pill, actions taken (booked/requested, handoff sent, escalated, CRM deal, price-mentioned warning), length, cost, and a "Mark won" toggle for qualified leads.
   - **Expanded row (the designer handoff view):**
     - summary
     - phone
     - area and scope
     - timeline
     - decision-maker
     - budget (only if the caller volunteered it)
     - language and mood
     - booking
     - **five-criteria rubric:** real project, service area, timeline, budget, decision-maker — each pass, fail or unclear, with its evidence
     - flags
     - full transcript (long text; it should collapse)
   - Needs filters by outcome, after-hours only and "needs action" (incomplete calls and escalations), plus search by name or number.
10. **Existing clients:** a small table (phone, name, project, designer) with an add form and a remove action. It's used to recognise complaints.

`sample-data.json` has realistic numbers and 10 example calls covering every state. Design with it.

## Feel and brand
- **Warm, calm and editorial.** Think of an interior studio's mood board: natural materials, terracotta, sage, warm off-white, deep green ink. Not a neon SaaS dashboard.
- **Typography:** a refined serif or soft grotesk for headings, and a clean sans with tabular numerals for data.
- **Generous whitespace and quiet borders.** One accent colour, and status colours used only for status.
- **"Aangan"** means courtyard. A subtle courtyard or grid motif is welcome; keep it understated.
- **Indian number formatting** (₹8,75,000 · ₹8–14 L), and all times in IST.

## Constraints
- It must stay buildable as plain HTML/CSS in a Next.js app router page: no heavy chart libraries, and charts can be inline SVG.
- **Accessible:**
  - status is never shown by colour alone (use an icon or label too)
  - contrast meets AA
  - categorical colours are colour-blind safe
  - hover tooltips on the chart bars
- Behind a password; internal use only.
- **Never show any per-sq-ft price or rate anywhere.** That's a hard business rule.

## Deliverables
1. Desktop overview, light and dark.
2. Calls list with one expanded call (the handoff view).
3. Mobile overview and mobile call detail.
4. Empty state (no calls yet) and a red compliance-alert state.
5. A short token sheet: colours, type scale, spacing, radii, so it can be implemented in CSS variables.
