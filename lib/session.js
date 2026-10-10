// Dashboard sign-in session. Works in both the edge middleware and Node (Web Crypto).
// The cookie holds a hash of user + password, so changing DASHBOARD_PASSWORD signs everyone out.
export const SESSION_COOKIE = 'aangan_session';

export const dashboardUser = () => (process.env.DASHBOARD_USER || 'nikhil').trim().toLowerCase();
export const dashboardPassword = () => process.env.DASHBOARD_PASSWORD || '';
/** Show the test credentials on the sign-in page unless HIDE_LOGIN_HINT=1. */
export const showLoginHint = () => process.env.HIDE_LOGIN_HINT !== '1';

export async function sessionToken() {
  const data = new TextEncoder().encode(`aangan:${dashboardUser()}:${dashboardPassword()}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
