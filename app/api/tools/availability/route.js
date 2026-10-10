// POST /api/tools/availability — the agent asks for two consultation slots to offer.
import { audit, checkSecret, unauthorized, readArgs } from '@/lib/auth';
import { getSlots } from '@/lib/calendar';
import { logEvent } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!(await audit(request, 'availability'))) return unauthorized();
  const { args } = await readArgs(request);
  try {
    const { slots, source } = await getSlots({
      preference: args.preference ?? args.preferred_time ?? args.when,
      from: args.from_date ?? args.from,
      count: Number(args.count) || 2,
    });
    if (!slots.length) {
      return Response.json({ slots: [], message: 'No free slots in the next week. Take their preferred times and tell them the studio will confirm by phone within one working day.' });
    }
    const message = `Offer these: ${slots.map((s) => s.spoken).join(' or ')}. Use the exact "start" value when booking.`;
    return Response.json({ slots, source, message });
  } catch (err) {
    await logEvent('error', { detail: { stage: 'availability', message: err.message } });
    return Response.json({ slots: [], message: "The calendar isn't reachable. Take their preferred day and time, and say the studio will confirm the slot by phone shortly." });
  }
}

// Some tool builders call with GET + query parameters.
export const GET = POST;
