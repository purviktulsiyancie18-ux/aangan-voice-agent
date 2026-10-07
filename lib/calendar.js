// Cal.com API v2: designer availability + booking a consultation during the call.
// If Cal.com isn't configured yet, falls back to "requested slot" mode: the
// agent still offers times, the request is logged, and the front desk confirms.
const BASE = 'https://api.cal.com/v2';
const TZ = 'Asia/Kolkata';

export const calConfigured = () => Boolean(process.env.CALCOM_API_KEY && process.env.CALCOM_USERNAME);

function headers(version) {
  return {
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    'cal-api-version': version,
    'content-type': 'application/json',
  };
}

export function speakable(iso) {
  return new Date(iso).toLocaleString('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Fallback: next working days at 11:00 and 16:00 IST. */
function fallbackSlots(fromDate, count) {
  const out = [];
  const d = new Date(fromDate);
  d.setUTCDate(d.getUTCDate() + 1);
  while (out.length < count) {
    const ymd = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const wd = d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short' });
    if (wd !== 'Sun') {
      for (const hhmm of ['11:00', '16:00']) out.push(new Date(`${ymd}T${hhmm}:00+05:30`).toISOString());
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out.slice(0, count);
}

/**
 * @param {{ from?: string, days?: number, count?: number, preference?: string }} opts
 * @returns {Promise<{ slots: {start: string, spoken: string}[], source: 'calcom'|'fallback' }>}
 */
export async function getSlots({ from, days = 7, count = 2, preference } = {}) {
  const start = from ? new Date(from) : new Date();
  const end = new Date(start.getTime() + days * 86400e3);

  let all;
  let source = 'fallback';
  if (calConfigured()) {
    const qs = new URLSearchParams({
      eventTypeSlug: process.env.CALCOM_EVENT_SLUG || 'consultation',
      username: process.env.CALCOM_USERNAME,
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: TZ,
    });
    const res = await fetch(`${BASE}/slots?${qs}`, { headers: headers('2024-09-04') });
    if (!res.ok) throw new Error(`Cal.com slots ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    all = Object.values(json.data ?? {}).flat().map((s) => s.start ?? s.time ?? s).filter(Boolean);
    source = 'calcom';
  } else {
    all = fallbackSlots(start, 12);
  }

  // Light preference handling: "morning", "evening", "weekend", "saturday"...
  const pref = `${preference ?? ''}`.toLowerCase();
  const matches = (iso) => {
    const d = new Date(iso);
    const h = Number(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }));
    const wd = d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long' }).toLowerCase();
    if (pref.includes('morning') && h >= 12) return false;
    if (pref.includes('afternoon') && (h < 12 || h >= 17)) return false;
    if (pref.includes('evening') && h < 16) return false;
    if (pref.includes('weekend') && !['saturday', 'sunday'].includes(wd)) return false;
    for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
      if (pref.includes(day) && wd !== day) return false;
    }
    return true;
  };
  const preferred = all.filter(matches);
  const pool = preferred.length ? preferred : all;

  // Spread the offers across different days where possible.
  const picked = [];
  const days_ = new Set();
  for (const s of pool) {
    const day = new Date(s).toLocaleDateString('en-CA', { timeZone: TZ });
    if (!days_.has(day)) { picked.push(s); days_.add(day); }
    if (picked.length === count) break;
  }
  for (const s of pool) { if (picked.length >= count) break; if (!picked.includes(s)) picked.push(s); }

  return { slots: picked.map((s) => ({ start: new Date(s).toISOString(), spoken: speakable(s) })), source };
}

/**
 * Book the consultation. Cal.com needs an attendee email for the invite; if the
 * caller doesn't give one, the studio inbox receives it and the front desk forwards.
 */
export async function bookSlot({ start, name, phone, email, notes, location, siteVisit }) {
  if (!calConfigured()) {
    return { status: 'requested', provider: 'manual', start, spoken: speakable(start), note: 'Cal.com not configured — front desk to confirm' };
  }
  const attendeeEmail = email || process.env.BOOKING_FALLBACK_EMAIL || process.env.HANDOFF_EMAIL;
  const body = {
    start: new Date(start).toISOString(),
    eventTypeSlug: process.env.CALCOM_EVENT_SLUG || 'consultation',
    username: process.env.CALCOM_USERNAME,
    attendee: {
      name: name || 'Aangan caller',
      email: attendeeEmail,
      timeZone: TZ,
      language: 'en',
      ...(phone ? { phoneNumber: phone.startsWith('+') ? phone : `+91${phone.slice(-10)}` } : {}),
    },
    bookingFieldsResponses: { notes: [notes, siteVisit ? `Site visit requested at ${location ?? 'site'}` : null].filter(Boolean).join(' · ') || undefined },
    metadata: { source: 'aangan-voice-agent', phone: `${phone ?? ''}` },
  };
  const res = await fetch(`${BASE}/bookings`, { method: 'POST', headers: headers('2024-08-13'), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Phone numbers sometimes fail validation — retry once without it.
    if (body.attendee.phoneNumber && JSON.stringify(json).toLowerCase().includes('phone')) {
      delete body.attendee.phoneNumber;
      const r2 = await fetch(`${BASE}/bookings`, { method: 'POST', headers: headers('2024-08-13'), body: JSON.stringify(body) });
      const j2 = await r2.json().catch(() => ({}));
      if (r2.ok) return toBooking(j2.data, attendeeEmail, !email);
    }
    throw new Error(`Cal.com booking ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return toBooking(json.data, attendeeEmail, !email);
}

function toBooking(d, email, inviteToStudio) {
  return {
    status: 'booked',
    provider: 'calcom',
    uid: d?.uid,
    id: d?.id,
    start: d?.start,
    end: d?.end,
    spoken: speakable(d?.start),
    meeting_url: d?.meetingUrl ?? d?.location ?? null,
    invite_sent_to: email,
    invite_to_studio_inbox: inviteToStudio,
  };
}
