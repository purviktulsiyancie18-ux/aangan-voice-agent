import { dashboardUser, dashboardPassword, showLoginHint } from '@/lib/session';
import LoginForm from './LoginForm';

export const metadata = { title: 'Sign in · Aangan Calls' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const hint = showLoginHint() && dashboardPassword() ? { user: dashboardUser(), password: dashboardPassword() } : null;
  return <LoginForm next={typeof sp?.next === 'string' ? sp.next : '/'} hint={hint} />;
}
