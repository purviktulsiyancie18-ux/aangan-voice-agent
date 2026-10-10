'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, dashboardUser, dashboardPassword, sessionToken } from '@/lib/session';

export async function signIn(_prev, formData) {
  const user = `${formData.get('user') ?? ''}`.trim().toLowerCase();
  const password = `${formData.get('password') ?? ''}`;
  if (user !== dashboardUser() || password !== dashboardPassword()) {
    return { error: 'That username and password don’t match. Try again.' };
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  const next = `${formData.get('next') ?? '/'}`;
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
