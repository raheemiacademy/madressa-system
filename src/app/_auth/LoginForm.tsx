'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef } from 'react';
import { PasswordInput } from '@/components/PasswordInput';
import type { Portal } from '@/server/auth';
import { loginAction, type LoginState } from './actions';

export function LoginForm({ portal, title, school, next }: { portal: Portal; title: string; school: string; next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction.bind(null, portal), undefined);
  const card = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    // A wrong password shakes the card once; a right one shows "✓ Signed in" for a moment before the page moves on.
    if (state?.error && card.current) { card.current.classList.remove('shake'); void card.current.offsetWidth; card.current.classList.add('shake'); }
    if (state?.next) { const t = setTimeout(() => router.replace(state.next!), 400); return () => clearTimeout(t); }
  }, [state, router]);
  const done = !!state?.next;
  return (
    <main className="ra-auth">
      <form ref={card} className="ra-auth-card" action={action} noValidate>
        <div>
          <div className="ra-muted" style={{ fontSize: 13 }}>{school}</div>
          <h1>{title}</h1>
        </div>
        {state?.error && <div className="ra-banner ra-alert" role="alert"><div>{state.error}</div></div>}
        {state?.notice && <div className="ra-banner ra-success" role="status"><div>{state.notice}</div></div>}
        <input type="hidden" name="next" value={next ?? ''} />
        <div className="ra-field">
          <label htmlFor="email">Email</label>
          <input className="ra-input" id="email" name="email" type="email" inputMode="email" autoComplete="username" enterKeyHint="next" required defaultValue={state?.email} />
        </div>
        <div className="ra-field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" autoComplete="current-password" enterKeyHint="go" required />
        </div>
        <button className={`ra-btn primary${done ? ' is-done' : ''}`} type="submit" disabled={pending || done} aria-busy={pending || undefined}>{done ? '✓ Signed in' : 'Sign in'}</button>
        {(portal === 'teacher' || portal === 'parent') && <Link className="ra-link" href={`/${portal}/set-password`}>First time here, or forgotten your password?</Link>}
        {portal === 'admin' && <Link className="ra-link" href="/admin/set-password">Forgotten your password?</Link>}
      </form>
    </main>
  );
}
