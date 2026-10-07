// POST /api/tools/book — book the consultation during the call.
import { checkSecret, unauthorized, readArgs } from '@/lib/auth';
import { bookSlot } from '@/lib/calendar';
import { logEvent } from '@/lib/db';
import { normPhone } from '@/lib/rules';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!checkSecret(request)) return unauthorized();
  const { body, args } = await readArgs(request);
  const start = args.start ?? args.slot ?? args.start_time;
  if (!start || Number.isNaN(new Date(start).getTime())) {
    return Response.json({ ok: false, message: 'Missing or invalid "start". Call check_availability first and pass the exact start value of the slot the caller chose.' });
  }
  const phone = normPhone(args.phone ?? args.caller_phone ?? body.from ?? body.call?.from);
  const callId = args.call_id ?? body.call_id ?? body.call?.id ?? null;

  try {
    const booking = await bookSlot({
      start,
      name: args.name ?? args.caller_name,
      phone,
      email: args.email,
      notes: args.notes ?? args.project_summary,
      location: args.location,
      siteVisit: Boolean(args.site_visit),
    });
    await logEvent('booking', { callId, phone, detail: { ...booking, name: args.name ?? null, email: args.email ?? null } });
    const message = booking.status === 'booked'
      ? `Booked for ${booking.spoken}. ${args.email ? `A calendar invite is on its way to ${args.email}.` : 'The studio will send the invite.'} Confirm the time back to the caller.`
      : `Slot requested for ${booking.spoken}. Tell the caller it's pencilled in and the studio will confirm by phone shortly.`;
    return Response.json({ ok: true, booking, message });
  } catch (err) {
    await logEvent('error', { callId, phone, detail: { stage: 'book', message: err.message, start } });
    return Response.json({ ok: false, message: 'That slot could not be booked — it may have just been taken. Offer to check other times, or note their preference and say the studio will confirm by phone.' });
  }
}
