'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PasswordInput } from '@/components/PasswordInput';
import type { Portal } from '@/server/auth';
import { changePasswordAction, requestLinkAction, setPasswordAction, type LoginState } from './actions';

function Card({ school, title, intro, state, children }: { school: string; title: string; intro: string; state: LoginState; children: React.ReactNode }) {
  return (
    <main className="ra-auth">
      <div className="ra-auth-card">
        <div><div className="ra-muted" style={{ fontSize: 13 }}>{school}</div><h1>{title}</h1><p className="ra-note" style={{ margin: '4px 0 0' }}>{intro}</p></div>
        {state?.error && <div className="ra-banner ra-alert" role="alert"><div>{state.error}</div></div>}
        {state?.notice && <div className="ra-banner ra-success" role="status"><div>{state.notice}</div></div>}
        {children}
      </div>
    </main>
  );
}

/** One password field (the eye button replaces "Type it again"), with the length rule shown up front and ticked as you type. */
function NewPassword({ state }: { state: LoginState }) {
  const [len, setLen] = useState(0);
  useEffect(() => setLen(0), [state]); // React empties the box after every submit
  const ok = len >= 10;
  return (
    <div className="ra-field"><label htmlFor="password">New password</label>
      <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} required aria-describedby="pw-rules" onInput={(e) => setLen(e.currentTarget.value.length)} />
      <ul className="ra-rules" id="pw-rules" aria-live="polite">
        <li className={ok ? 'ok' : undefined}><Icon name="check" />{ok ? 'At least 10 characters ✓' : `At least 10 characters${len ? ` (${10 - len} more)` : ''}`}</li>
      </ul>
    </div>
  );
}

/** Ask for a set-password link (first sign-in or forgotten password). */
export function RequestLinkForm({ portal, school }: { portal: Portal; school: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLinkAction.bind(null, portal), undefined);
  return (
    <Card school={school} title="Set your password" intro="We’ll email you a link to confirm your address and choose a password." state={state}>
      <form action={action} className="ra-form" noValidate>
        <div className="ra-field"><label htmlFor="email">Email</label>
          <input className="ra-input" id="email" name="email" type="email" inputMode="email" autoComplete="username" required defaultValue={state?.email} /></div>
        <button className="ra-btn primary" disabled={pending}>{pending ? 'Sending…' : 'Email me a link'}</button>
      </form>
      <Link className="ra-link" href={`/${portal}/login`}>Back to sign in</Link>
    </Card>
  );
}

/** The page an emailed link opens. */
export function SetPasswordForm({ portal, school, token }: { portal: Portal; school: string; token: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(setPasswordAction.bind(null, portal, token), undefined);
  return (
    <Card school={school} title="Choose your password" intro="This confirms your email address and signs you in." state={state}>
      <form action={action} className="ra-form" noValidate><NewPassword state={state} /><button className="ra-btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save and sign in'}</button></form>
    </Card>
  );
}

/** Forced after signing in with a password the school set. */
export function ChangePasswordForm({ portal, school }: { portal: Portal; school: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(changePasswordAction.bind(null, portal), undefined);
  return (
    <Card school={school} title="Choose your own password" intro="The school set your current password, so please choose a new one before you carry on." state={state}>
      <form action={action} className="ra-form" noValidate><NewPassword state={state} /><button className="ra-btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save password'}</button></form>
    </Card>
  );
}
