'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { Portal } from '@/server/auth';
import { loginAction, type LoginState } from './actions';

export function LoginForm({ portal, title, school, next }: { portal: Portal; title: string; school: string; next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction.bind(null, portal), undefined);
  return (
    <main className="ra-auth">
      <form className="ra-auth-card" action={action} noValidate>
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
          <input className="ra-input" id="password" name="password" type="password" autoComplete="current-password" enterKeyHint="go" required />
        </div>
        <button className="ra-btn primary" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
        {(portal === 'teacher' || portal === 'parent') && <Link className="ra-link" href={`/${portal}/set-password`}>First time here, or forgotten your password?</Link>}
      </form>
    </main>
  );
}
