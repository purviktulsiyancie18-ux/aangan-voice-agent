// Shared-secret check for calls from Vaani Labs (tools + webhook).
// Accepts header x-aangan-secret, "Authorization: Bearer <secret>", or ?secret=.
import { timingSafeEqual } from 'node:crypto';

function same(a, b) {
  const x = Buffer.from(`${a}`);
  const y = Buffer.from(`${b}`);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkSecret(request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // not configured → open (local dev only)
  const url = new URL(request.url);
  const given =
    request.headers.get('x-aangan-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    url.searchParams.get('secret');
  return Boolean(given) && same(given, secret);
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/** Tool calls arrive in different shapes; pull the arguments out of any of them. */
export async function readArgs(request) {
  const body = await request.json().catch(() => ({}));
  const args = body.args ?? body.arguments ?? body.parameters ?? body.input ?? body.tool_call?.arguments ?? body;
  const parsed = typeof args === 'string' ? safeJson(args) : args;
  return { body, args: parsed ?? {} };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
