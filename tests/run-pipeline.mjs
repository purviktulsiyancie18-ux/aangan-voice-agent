// npm test — runs NEW synthetic phone calls (not the September transcripts)
// through the full pipeline against an in-memory PGlite DB with REAL Gemini.
// Resend / HubSpot / Cal.com are intercepted so nothing is sent.
import assert from 'node:assert/strict';

if (process.env.DATABASE_URL !== 'pglite') {
  console.error('Run with DATABASE_URL=pglite (npm test does this).');
  process.exit(1);
}
process.env.HANDOFF_EMAIL ||= 'designer@example.com';
process.env.ESCALATION_EMAIL ||= 'nikhil@example.com';
process.env.HUBSPOT_TOKEN ||= 'test-token';

// ---- intercept outbound side effects; let Gemini through ----
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  const u = `${url}`;
  if (u.includes('api.resend.com')) {
    const body = JSON.parse(init.body);
    sent.push({ kind: 'email', to: body.to, subject: body.subject });
    return Response.json({ id: `email_${sent.length}` });
  }
  if (u.includes('api.hubapi.com')) {
    sent.push({ kind: 'hubspot', url: u });
    if (u.includes('/search')) return Response.json({ results: [] });
    return Response.json({ id: `${1000 + sent.length}` });
  }
  if (u.includes('api.cal.com')) throw new Error('Cal.com should not be called in tests');
  return realFetch(url, init);
};

const { processCall } = await import('../lib/pipeline.js');
const { query, logEvent } = await import('../lib/db.js');
const { agentQuotedPrice, isAfterHours, classify } = await import('../lib/rules.js');
const { bookSlot, getSlots } = await import('../lib/calendar.js');

// ---- pure rule checks (no AI) ----
assert.equal(agentQuotedPrice('Agent: Pricing depends on the site, the materials you choose, and the scope.'), false);
assert.equal(agentQuotedPrice('Caller: my budget is 1.5 lakh\nAgent: Thank you — 1.5 lakh would be below what this scope costs with us.'), false, 'echoing caller budget is not a quote');
assert.equal(agentQuotedPrice('Agent: Our rates start from ₹1,800 per sq ft.'), true);
assert.equal(agentQuotedPrice('Agent: A 2BHK is typically 12 lakh.'), true);
assert.equal(agentQuotedPrice('Caller: Is it 2000 per sq ft?\nAgent: I can\'t confirm a number — the designer will.'), false);
assert.equal(isAfterHours('2026-10-07T17:17:00Z'), true, '10:47pm IST Wed');      // T08-like
assert.equal(isAfterHours('2026-10-07T05:30:00Z'), false, '11:00am IST Wed');
assert.equal(isAfterHours('2026-10-10T05:30:00Z'), true, 'Saturday');
assert.equal(classify({}, 'Hello?').classification, 'incomplete');
console.log('✓ rule unit checks');

// ---- synthetic calls ----
const at = (isoIst) => new Date(`${isoIst}+05:30`).toISOString();
const CASES = [
  {
    name: 'Clean qualified lead (booked in call)', expect: 'qualified', book: true,
    payload: { call_id: 't-qualified', from: '+91 98220 11111', started_at: at('2026-10-06T21:40:00'), duration: 312,
      transcript: [
        { role: 'assistant', content: 'Good evening, Aangan Studio, this is Aanya. How can I help you?' },
        { role: 'user', content: "Hi, I'm Kavya Rao. We just bought a 3BHK in Baner, near Balewadi High Street, and want the full interiors done." },
        { role: 'assistant', content: 'Congratulations! Are you looking for design and execution together?' },
        { role: 'user', content: 'Yes, the whole thing — modular kitchen, wardrobes in all three bedrooms, living and dining.' },
        { role: 'assistant', content: 'Lovely. Roughly how big is the flat, and what state is it in?' },
        { role: 'user', content: 'About 1,250 sq ft carpet. Builder handover, completely bare.' },
        { role: 'assistant', content: 'When would you need the project complete?' },
        { role: 'user', content: "We'd like to move in by May next year." },
        { role: 'assistant', content: 'That works well. Are you the owner?' },
        { role: 'user', content: 'Yes, my husband and I. He asked me to go ahead and book.' },
        { role: 'assistant', content: 'I have Thursday the 8th at 11 am or Friday the 9th at 4 pm — which suits you?' },
        { role: 'user', content: 'Friday 4 pm. My email is kavya.rao@example.com.' },
        { role: 'assistant', content: "You're booked for Friday 9 October at 4 pm. The invite is on its way, and your designer will already have everything you've told me." },
      ] },
  },
  {
    name: 'Price pusher — deflected 3 times, still qualified', expect: 'qualified', pricingAsked: true,
    payload: { call_id: 't-price', from: '9890022222', started_at: at('2026-10-05T14:10:00'), duration: 290,
      transcript: `Agent: Good afternoon, Aangan Studio, this is Aanya.
Caller: Hi, I have a 2BHK in Hinjewadi Phase 2, around 900 square feet. How much do you charge per square foot?
Agent: Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.
Caller: Just a ballpark. Another studio said 1,500 per square foot. Are you around that?
Agent: I understand. The consultation is free and there's no obligation — it's the quickest way to get a proper number for your home.
Caller: Okay fine. It's a full redesign, kitchen, both bedrooms, living room. I'm the owner.
Agent: When would you need it complete?
Caller: By March is fine, no hurry.
Caller: But seriously, even a rough range?
Agent: Pricing depends on the site, the materials you choose, and the scope — your designer will go through it with you. Shall I book a consultation?
Caller: Yes, book it. I'm Rahul Menon.` },
  },
  {
    name: 'Outside service area (Lonavala)', expect: 'not_fit',
    payload: { call_id: 't-area', from: '9890033333', started_at: at('2026-10-04T11:00:00'), duration: 150,
      transcript: `Agent: Good morning, Aangan Studio.
Caller: Hello, I have a weekend bungalow in Lonavala, about 2,000 square feet. I want to redo all the interiors with execution, start in December.
Agent: Thank you for thinking of us. We only work in Pune and PCMC — we don't have our vendor network in Lonavala, so I'm sorry we can't help with this one.
Caller: Okay, thanks.` },
  },
  {
    name: 'Advice only', expect: 'not_fit',
    payload: { call_id: 't-advice', from: '9890044444', started_at: at('2026-10-02T12:30:00'), duration: 140,
      transcript: `Agent: Good afternoon, Aangan Studio.
Caller: Hi, I live in Kothrud. I don't want to renovate, I just want a designer to come over and suggest wall colours and how to rearrange my furniture. Maybe an hour.
Agent: We're a full-service studio, so our projects always include design and execution together. If you decide to go ahead with a full redesign, we'd love to hear from you.
Caller: No, just advice for now. Thanks.` },
  },
  {
    name: 'Timeline too short, refuses later start', expect: 'not_fit',
    payload: { call_id: 't-timeline', from: '9890055555', started_at: at('2026-10-07T10:30:00'), duration: 180,
      transcript: `Agent: Good morning, Aangan Studio.
Caller: Hi, my daughter's wedding reception is at our flat in Aundh in four weeks. I want the living room and dining fully redone with new furniture before that.
Agent: I don't want to over-promise — design alone takes 3 to 4 weeks, so we couldn't do a good job by then. If a start after the wedding works, I'd be happy to book you in.
Caller: No, after the wedding there's no point. It has to be before. Thanks anyway.` },
  },
  {
    name: 'Volunteered budget clearly too low', expect: 'not_fit',
    payload: { call_id: 't-budget', from: '9890066666', started_at: at('2026-10-03T16:00:00'), duration: 200,
      transcript: `Agent: Good afternoon, Aangan Studio.
Caller: Hello. I have a 2BHK in Pimpri, 800 square feet. I want the full house done — kitchen, two bedrooms with wardrobes, living room, false ceiling. My total budget is 2 lakh, not more. Possible?
Agent: Thank you for being upfront. I want to be honest with you — for design and full execution of that scope, that budget would be well below what a project like this costs with us. A local contractor may be a better fit at that budget.
Caller: Okay. Thanks for telling me straight.` },
  },
  {
    name: 'Existing-client complaint → escalate', expect: 'existing_client', escalate: true,
    payload: { call_id: 't-escalate', from: '9890077777', started_at: at('2026-10-06T20:15:00'), duration: 230,
      transcript: `Agent: Good evening, Aangan Studio, this is Aanya.
Caller: This is Farhan Sheikh. You're doing my 3BHK in Wakad. The carpenter hasn't come for six days and my designer Meera isn't answering. I'm paying rent elsewhere while this drags on!
Agent: I'm really sorry — that's not the experience we want you to have. Can I confirm the best number to call you back on?
Caller: This one. And I want Nikhil or someone senior, not another excuse.
Agent: I'm escalating this right now. Nikhil or a senior member of the team will call you back within 15 minutes.` },
  },
  {
    name: 'Dropped call', expect: 'incomplete',
    payload: { call_id: 't-dropped', from: '9890088888', started_at: at('2026-10-06T23:05:00'), duration: 9,
      transcript: 'Agent: Hello, Aangan—\nCaller: Hi I wanted' },
  },
  {
    name: 'Hinglish caller, qualified', expect: 'qualified',
    payload: { call_id: 't-hinglish', from: '9890099999', started_at: at('2026-10-04T19:45:00'), duration: 260,
      transcript: `Agent: Namaste, Aangan Studio, main Aanya bol rahi hoon.
Caller: Namaste. Mera 2BHK flat hai Ravet mein, 850 sq ft. Poora interior karwana hai — kitchen, wardrobes, living room, sab kuch execution ke saath.
Agent: Bilkul, Ravet hamare service area mein hai. Aapko kab tak complete chahiye?
Caller: Koi jaldi nahi hai, February-March tak ho jaye toh achha hai. Main aur meri wife owner hain, dono consultation pe aayenge.
Agent: Perfect. Saturday subah 11 baje ya Monday shaam 4 baje — kaunsa theek rahega?
Caller: Saturday subah. Naam Sunil Pawar.` },
  },
  {
    name: 'Calling for parents — qualified, decision-maker flagged', expect: 'qualified',
    payload: { call_id: 't-parents', from: '9822012345', started_at: at('2026-10-05T12:00:00'), duration: 240,
      transcript: `Agent: Good afternoon, Aangan Studio.
Caller: Hi, I'm calling for my parents. They have a 3BHK in Kalyani Nagar, lived in for 15 years, and want the kitchen, master bedroom and living room completely redone with execution.
Agent: That sounds lovely. When would they need it complete?
Caller: Sometime early next year, they're flexible.
Agent: Will your parents be making the decision?
Caller: I'm just checking things out first. I'll talk to them about it.` },
  },
  {
    name: 'Restaurant — out of scope', expect: 'not_fit',
    payload: { call_id: 't-cafe', from: '9822054321', started_at: at('2026-10-02T15:00:00'), duration: 120,
      transcript: `Agent: Good afternoon, Aangan Studio.
Caller: Hi, I'm opening a café in Viman Nagar, 1,200 square feet, opening in February. Can you do the interiors?
Agent: Thank you for reaching out. Cafés and restaurants are outside our scope — we focus on homes and offices. A studio that specialises in hospitality would be a better fit.
Caller: Oh okay.` },
  },
  {
    name: 'COMPLIANCE: agent leaked a price', expect: 'qualified', priceQuoted: true,
    payload: { call_id: 't-leak', from: '9822067890', started_at: at('2026-10-06T11:00:00'), duration: 200,
      transcript: `Agent: Good morning, Aangan Studio.
Caller: Hi, I'm Neeta. I have a 2BHK in Kharadi, 950 sq ft, want a full redesign with execution, done by April. I'm the owner. What does it cost?
Agent: For a standard specification it's usually around ₹1,800 to ₹2,400 per square foot.
Caller: Okay, let's book a consultation.` },
  },
];

// Simulate the in-call booking tool for the cases that book.
for (const c of CASES.filter((x) => x.book)) {
  const { slots } = await getSlots({ preference: 'friday afternoon' });
  const b = await bookSlot({ start: slots[0].start, name: 'Kavya Rao', phone: '9822011111', email: 'kavya.rao@example.com' });
  await logEvent('booking', { callId: c.payload.call_id, phone: '9822011111', detail: b });
}
// Existing client on file.
await query("insert into clients (phone, name, project, designer) values ('9890077777', 'Farhan Sheikh', '3BHK Wakad', 'Meera')");

let pass = 0, fail = 0;
const results = [];
const queue = [...CASES];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const t0 = Date.now();
    try {
      const r = await processCall(c.payload);
      const errs = [];
      if (r.classification !== c.expect) errs.push(`classification ${r.classification} ≠ ${c.expect} (${r.reason})`);
      if (c.pricingAsked && !r.pricing_asked) errs.push('pricing_asked not detected');
      if (c.priceQuoted !== undefined && r.price_quoted !== c.priceQuoted) errs.push(`price_quoted ${r.price_quoted}`);
      if (!c.priceQuoted && r.price_quoted) errs.push('false compliance flag');
      if (c.expect === 'qualified' && !r.handoff_sent) errs.push('handoff not sent');
      if (c.escalate && !r.escalation_sent) errs.push('escalation not sent');
      if (c.book && !r.booking) errs.push('booking not attached');
      results.push({ name: c.name, ok: !errs.length, errs, r, ms: Date.now() - t0 });
    } catch (err) {
      results.push({ name: c.name, ok: false, errs: [err.message], ms: Date.now() - t0 });
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

for (const c of CASES) {
  const x = results.find((y) => y.name === c.name);
  x.ok ? pass++ : fail++;
  console.log(`${x.ok ? '✓' : '✗'} ${c.name} → ${x.r?.classification ?? 'error'} (${(x.ms / 1000).toFixed(1)}s, ₹${Number(x.r?.cost_ai_inr ?? 0).toFixed(3)} AI)`);
  if (!x.ok) x.errs.forEach((e) => console.log(`    ${e}`));
  if (x.r?.flags?.length) console.log(`    flags: ${x.r.flags.join(' | ')}`);
}

// Idempotency: same webhook twice must not double-send.
const before = sent.filter((s) => s.kind === 'email').length;
const again = await processCall(CASES[0].payload);
assert.equal(again.deduped, true, 'duplicate webhook should be deduped');
assert.equal(sent.filter((s) => s.kind === 'email').length, before, 'no duplicate email');
console.log('✓ duplicate webhook ignored');

// Returning caller recognised.
const back = await processCall({ call_id: 't-return', from: '+91 98900 88888', started_at: new Date().toISOString(), duration: 5, transcript: '' });
assert.equal(back.returning_caller, true);
console.log('✓ returning caller recognised (dropped-call number called back)');

const [agg] = await query('select count(*)::int n, sum(cost_ai_inr)::float ai, sum(ai_tokens_in)::int tin, sum(ai_tokens_out)::int tout from calls');
console.log(`\n${pass}/${CASES.length} calls classified as expected · ${sent.filter((s) => s.kind === 'email').length} emails · ${sent.filter((s) => s.kind === 'hubspot').length} HubSpot calls intercepted`);
console.log(`Gemini: ${agg.tin} in / ${agg.tout} out tokens · ₹${agg.ai.toFixed(2)} for ${agg.n} calls`);
process.exit(fail ? 1 : 0);
