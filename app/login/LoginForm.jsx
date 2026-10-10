'use client';
import { useActionState, useRef } from 'react';
import { signIn } from './actions';

const SERIF = 'var(--font-display)';
const input = { height: 48, border: '1px solid var(--line-2)', borderRadius: 999, background: 'var(--bg)', padding: '0 18px', font: 'inherit', fontSize: 15, color: 'var(--ink)', outlineColor: 'var(--accent)', width: '100%' };
const label = { fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', paddingLeft: 4 };

export default function LoginForm({ next, hint }) {
  const [state, action, pending] = useActionState(signIn, null);
  const userRef = useRef(null);
  const passRef = useRef(null);

  const fillTest = () => {
    if (!hint) return;
    userRef.current.value = hint.user;
    passRef.current.value = hint.password;
    passRef.current.focus();
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 16px', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* courtyard arches */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: -220, transform: 'translateX(-50%)', width: 640, height: 760, border: '1px solid var(--line-2)', borderRadius: '999px 999px 60px 60px', pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: -200, transform: 'translateX(-50%)', width: 480, height: 620, border: '1px solid var(--line)', borderRadius: '999px 999px 48px 48px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line-2)', display: 'grid', placeItems: 'center', boxShadow: 'var(--card-sh)' }}>
            <div style={{ width: 20, height: 26, border: '1.5px solid var(--accent)', borderBottomWidth: 0, borderRadius: '999px 999px 4px 4px' }} />
          </div>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.1 }}>Aangan Studio</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Enquiry desk</div>
          </div>
        </div>

        <form action={action} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 28, boxShadow: 'var(--shadow)', padding: '30px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 32, lineHeight: 1.1, letterSpacing: '-.015em' }}>Welcome <em style={{ color: 'var(--accent-text)' }}>back</em></h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>Sign in to see every call the receptionist answered, day and night.</p>
          </div>

          <input type="hidden" name="next" value={next} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={label}>Username</span>
            <input ref={userRef} name="user" autoComplete="username" required autoFocus placeholder="nikhil" style={input} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={label}>Password</span>
            <input ref={passRef} name="password" type="password" autoComplete="current-password" required placeholder="••••••••" style={input} />
          </label>

          {state?.error && (
            <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 16, background: 'var(--bad-soft)', color: 'var(--bad-text)', fontSize: 13, fontWeight: 600 }}>
              <span aria-hidden="true">!</span>{state.error}
            </div>
          )}

          <button type="submit" disabled={pending} style={{ height: 50, border: 0, borderRadius: 999, background: 'var(--ink)', color: 'var(--bg)', font: 'inherit', fontSize: 15, fontWeight: 700, cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.75 : 1 }}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {hint && (
          <div style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab,var(--accent) 40%,transparent)', borderRadius: 22, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }}>Test login</span>
              <button type="button" onClick={fillTest} style={{ border: '1px solid var(--accent)', background: 'var(--surface)', color: 'var(--accent-text)', font: 'inherit', fontSize: 12, fontWeight: 700, height: 32, padding: '0 14px', borderRadius: 999, cursor: 'pointer' }}>Use test login</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 14 }}>
              <span style={{ color: 'var(--ink-3)' }}>Username</span><code style={{ fontWeight: 700, fontFamily: 'inherit' }}>{hint.user}</code>
              <span style={{ color: 'var(--ink-3)' }}>Password</span><code style={{ fontWeight: 700, fontFamily: 'inherit' }}>{hint.password}</code>
            </div>
          </div>
        )}

        <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Internal · Aangan Studio, Pune</p>
      </div>
    </main>
  );
}
