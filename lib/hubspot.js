// HubSpot (free CRM): qualified call → contact + deal. Skipped if HUBSPOT_TOKEN is unset.
const BASE = 'https://api.hubapi.com';

export const hubspotConfigured = () => Boolean(process.env.HUBSPOT_TOKEN);

async function hs(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function upsertContact({ name, phone, email }) {
  const [firstname, ...rest] = `${name || 'Aangan caller'}`.split(' ');
  const properties = { firstname, lastname: rest.join(' ') || undefined, phone: phone || undefined, email: email || undefined, lifecyclestage: 'lead' };

  if (phone) {
    const found = await hs('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: `*${phone.slice(-10)}` }] }], limit: 1 }),
    });
    const id = found.json?.results?.[0]?.id;
    if (id) return id;
  }
  const created = await hs('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties }) });
  if (created.ok) return created.json.id;
  // 409 = email already exists → HubSpot returns the existing id in the message.
  const m = JSON.stringify(created.json).match(/Existing ID: (\d+)/);
  if (m) return m[1];
  throw new Error(`HubSpot contact ${created.status}: ${JSON.stringify(created.json).slice(0, 200)}`);
}

export async function createDeal(call) {
  if (!hubspotConfigured()) return null;
  const p = call.project ?? {};
  const contactId = await upsertContact({ name: call.caller_name, phone: call.caller_phone, email: call.caller_email });
  const description = [
    call.summary,
    `Location: ${p.location ?? '—'} · Area: ${p.carpet_area_sqft ?? '—'} sq ft · Scope: ${p.rooms_scope ?? p.scope_level ?? '—'}`,
    `Timeline: ${p.timeline_text ?? '—'} · Decision-maker: ${p.decision_maker ?? '—'}`,
    call.booking?.start ? `Consultation: ${call.booking.spoken ?? call.booking.start}` : 'Consultation: not booked',
    (call.flags ?? []).length ? `Flags: ${call.flags.join('; ')}` : '',
  ].filter(Boolean).join('\n');

  const deal = await hs('/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        dealname: `${call.caller_name || 'Phone lead'} — ${p.subtype || p.property_type || 'Interior project'}, ${p.location || 'Pune'}`,
        pipeline: 'default',
        dealstage: call.booking?.start ? 'appointmentscheduled' : 'qualifiedtobuy',
        description,
      },
      associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }],
    }),
  });
  if (!deal.ok) throw new Error(`HubSpot deal ${deal.status}: ${JSON.stringify(deal.json).slice(0, 200)}`);
  return deal.json.id;
}
