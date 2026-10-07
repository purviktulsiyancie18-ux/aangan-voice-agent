// Password-protects the dashboard (HTTP Basic auth, any username).
// API routes are protected separately by WEBHOOK_SECRET (lib/auth.js).
import { NextResponse } from 'next/server';

export function middleware(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const [, given] = atob(header.slice(6)).split(/:(.*)/s);
      if (given === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Aangan dashboard"' },
  });
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
