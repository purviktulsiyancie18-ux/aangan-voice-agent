// POST /api/tools/lookup-caller — called by the agent at the start of every call.
import { audit, checkSecret, unauthorized, readArgs } from '@/lib/auth';
import { lookupCaller } from '@/lib/pipeline';
import { formatIST } from '@/lib/rules';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!(await audit(request, 'lookup-caller'))) return unauthorized();
  const { body, args } = await readArgs(request);
  const phone = args.phone ?? args.caller_phone ?? args.from ?? body.from ?? body.call?.from ?? body.caller;
  try {
    const ctx = await lookupCaller(phone);
    let message;
    if (ctx.existing_client) {
      message = `This is an EXISTING CLIENT: ${ctx.client.name ?? 'name on file'}${ctx.client.project ? `, project: ${ctx.client.project}` : ''}${ctx.client.designer ? `, designer: ${ctx.client.designer}` : ''}. Greet them by name. If they have a complaint or concern, apologise, do not try to solve it, collect the details and promise a senior callback within 15 minutes.`;
    } else if (ctx.previous_calls > 0) {
      const last = ctx.last_call;
      message = `Returning caller${ctx.name ? ` (${ctx.name})` : ''}. They called before on ${formatIST(last.at)}${last.booking?.spoken ? ` and have a consultation on ${last.booking.spoken}` : ''}. Acknowledge that they called before, apologise if their last call was cut off, and don't make them repeat what they already told us: ${last.summary ?? 'no summary'}.`;
    } else {
      message = 'New caller. No previous record.';
    }
    return Response.json({ ...ctx, message });
  } catch (err) {
    return Response.json({ known: false, message: 'Lookup unavailable — treat as a new caller.', error: err.message });
  }
}

// Some tool builders call with GET + query parameters.
export const GET = POST;
