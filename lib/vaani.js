// Vaani Voice API (docs.vaanivoice.ai): the call_postprocessing webhook carries
// the transcript but not the caller's number or cost, so we look those up.
const BASE = 'https://api.vaanivoice.ai/api';

export const vaaniConfigured = () => Boolean(process.env.VAANI_API_KEY);

/** Find a call in recent call history → { phone, direction, cost, startedAt }. */
export async function fetchCallInfo(callId) {
  if (!vaaniConfigured() || !callId) return null;
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${BASE}/call-history?page=${page}&page_size=50`, {
      headers: { 'X-API-Key': process.env.VAANI_API_KEY },
    });
    if (!res.ok) throw new Error(`Vaani call-history ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const c = (json.data ?? []).find((x) => x.call_id === callId);
    if (c) {
      const outbound = /out/i.test(c.direction ?? c.call_type ?? '');
      return {
        phone: outbound ? c.to_number : c.from_number,
        direction: c.direction ?? c.call_type,
        cost: typeof c.call_cost === 'number' ? c.call_cost : null,
        startedAt: c.Start_time ? `${c.Start_time}${/[zZ+]/.test(c.Start_time.slice(19)) ? '' : 'Z'}` : null,
      };
    }
    if (!json.pagination?.has_next) break;
  }
  return null;
}
