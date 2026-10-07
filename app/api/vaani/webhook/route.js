// POST /api/vaani/webhook — Vaani Labs post-call webhook.
// Replies 200 immediately and runs the pipeline in the background (after()),
// so Vaani never times out and retries. Add ?sync=1 to wait for the result.
import { after } from 'next/server';
import { checkSecret, unauthorized } from '@/lib/auth';
import { processCall, normalizePayload } from '@/lib/pipeline';
import { logEvent } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NON_FINAL = /^(call[._-]?)?(started|ringing|initiated|in[_-]?progress|queued|answered|ongoing)$/i;

export async function POST(request) {
  if (!checkSecret(request)) return unauthorized();
  const raw = await request.json().catch(() => null);
  if (!raw) return Response.json({ error: 'invalid JSON' }, { status: 400 });

  const n = normalizePayload(raw);
  if (n.event && NON_FINAL.test(`${n.event}`)) return Response.json({ ok: true, ignored: n.event });

  const run = async () => {
    try {
      return await processCall(raw);
    } catch (err) {
      console.error('pipeline failed', err);
      await logEvent('error', { callId: n.callId, phone: n.phone, detail: { stage: 'pipeline', message: err.message } });
      throw err;
    }
  };

  if (new URL(request.url).searchParams.get('sync')) {
    try {
      const r = await run();
      return Response.json({ ok: true, call_id: r.call_id, classification: r.classification, reason: r.reason, handoff_sent: r.handoff_sent, escalation_sent: r.escalation_sent, price_quoted: r.price_quoted, deduped: Boolean(r.deduped) });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  after(() => run().catch(() => {}));
  return Response.json({ ok: true, call_id: n.callId, queued: true });
}

export async function GET() {
  return Response.json({ ok: true, hint: 'POST the Vaani post-call payload here with header x-aangan-secret' });
}
