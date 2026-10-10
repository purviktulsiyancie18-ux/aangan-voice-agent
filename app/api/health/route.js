// GET /api/health — which integrations are configured + DB reachability. Never returns secret values.
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VARS = ['DATABASE_URL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'RESEND_API_KEY', 'EMAIL_FROM', 'HANDOFF_EMAIL', 'ESCALATION_EMAIL',
  'CALCOM_API_KEY', 'CALCOM_USERNAME', 'CALCOM_EVENT_SLUG', 'HUBSPOT_TOKEN', 'VAANI_API_KEY', 'WEBHOOK_SECRET', 'DASHBOARD_PASSWORD'];

export async function GET() {
  const env = Object.fromEntries(VARS.map((v) => [v, Boolean(process.env[v])]));
  let db = { ok: false };
  try {
    const [c] = await query('select count(*)::int as calls from calls');
    const [k] = await query('select count(*)::int as clients from clients');
    db = { ok: true, calls: c.calls, clients: k.clients };
  } catch (err) {
    db = { ok: false, error: err.message };
  }
  const required = ['DATABASE_URL', 'GEMINI_API_KEY', 'RESEND_API_KEY', 'HANDOFF_EMAIL', 'WEBHOOK_SECRET'];
  const ok = db.ok && required.every((v) => env[v]);
  return Response.json({
    ok,
    db,
    env,
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    calendar: env.CALCOM_API_KEY && env.CALCOM_USERNAME ? 'calcom' : 'fallback (requests logged, front desk confirms)',
    hubspot: env.HUBSPOT_TOKEN ? 'on' : 'off (optional)',
  }, { status: ok ? 200 : 503 });
}
