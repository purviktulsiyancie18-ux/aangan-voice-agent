// Shared-secret check for calls from Vaani Labs (tools + webhook).
// Accepts header x-aangan-secret, "Authorization: Bearer <secret>", or ?secret=.
import { timingSafeEqual } from 'node:crypto';
import { logEvent } from './db.js';

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
  return Boolean(given) && same(`${given}`.trim(), secret);
}

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/** Tool calls arrive in different shapes; pull the arguments out of any of them. */
export async function readArgs(request) {
  const body = (await request.json().catch(() => null)) ?? {};
  const args = body.args ?? body.arguments ?? body.parameters ?? body.input ?? body.tool_call?.arguments ?? body;
  const parsed = typeof args === 'string' ? safeJson(args) : args;
  // Some tool builders send extracted parameters as query string instead of JSON.
  const query = Object.fromEntries([...new URL(request.url).searchParams].filter(([k]) => k !== 'secret'));
  return { body, args: { ...query, ...(parsed ?? {}) } };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

/** Record every inbound Vaani request (even rejected ones) so a failed setup can be diagnosed. */
export async function audit(request, route) {
  const authorized = checkSecret(request);
  try {
    const url = new URL(request.url);
    const query = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'secret'));
    const text = request.method === 'GET' ? '' : await request.clone().text().catch(() => '');
    await logEvent('hit', {
      detail: {
        route, method: request.method, authorized,
        secret_via: request.headers.get('x-aangan-secret') ? 'header' : request.headers.get('authorization') ? 'bearer' : url.searchParams.get('secret') ? 'query' : 'none',
        content_type: request.headers.get('content-type'),
        user_agent: request.headers.get('user-agent'),
        query, body: text.slice(0, 3000),
      },
    });
  } catch {}
  return authorized;
}
