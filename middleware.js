// Protects the dashboard with a sign-in page (/login) and a session cookie.
// API routes are protected separately by WEBHOOK_SECRET (lib/auth.js).
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, dashboardPassword, sessionToken } from '@/lib/session';

export async function middleware(request) {
  if (!dashboardPassword()) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value === (await sessionToken())) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = request.nextUrl.pathname === '/' && !request.nextUrl.search ? '' : `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/|login|_next/static|_next/image|favicon.ico).*)'],
};
