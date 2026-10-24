'use client';

import { useActionState } from 'react';
import { setupAction, type SetupState } from './actions';

/** First-time setup: the madrasah's name and the first admin account, protected by the setup code. */
export function SetupForm({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAction, undefined);
  const err = (k: string) => state?.errors?.[k];
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, help?: string) => (
    <div className="ra-field">
      <label htmlFor={`s-${name}`}>{label}</label>
      <input className="ra-input" id={`s-${name}`} name={name} defaultValue={name !== 'password' && name !== 'code' ? state?.values?.[name] : undefined}
        aria-invalid={!!err(name)} aria-describedby={err(name) || help ? `s-${name}-msg` : undefined} {...props} />
      {(err(name) || help) && <span id={`s-${name}-msg`} className={err(name) ? 'err' : 'help'}>{err(name) ?? help}</span>}
    </div>
  );
  return (
    <main className="ra-auth">
      <form className="ra-auth-card" action={action} noValidate>
        <div>
          <div className="ra-muted" style={{ fontSize: 13 }}>Welcome</div>
          <h1>Set up your madrasah</h1>
          <p className="ra-muted" style={{ margin: '6px 0 0', fontSize: 14 }}>This makes your madrasah and your own admin account. It takes a minute; then a short checklist walks you through the rest.</p>
        </div>
        {!ready && <div className="ra-banner ra-alert" role="alert"><div>This site isn’t ready to be set up yet. Whoever installed it needs to set a setup code (SETUP_CODE) on the server.</div></div>}
        {state?.error && <div className="ra-banner ra-alert" role="alert"><div>{state.error}</div></div>}
        {field('code', 'Setup code', { type: 'password', autoComplete: 'off', required: true }, 'The code you were given by whoever installed the system.')}
        {field('school', 'Madrasah name', { autoComplete: 'organization', required: true, enterKeyHint: 'next' })}
        {field('name', 'Your name', { autoComplete: 'name', required: true, enterKeyHint: 'next' })}
        {field('email', 'Your email (you’ll sign in with this)', { type: 'email', inputMode: 'email', autoComplete: 'username', required: true, enterKeyHint: 'next' })}
        {field('password', 'Choose a password', { type: 'password', autoComplete: 'new-password', required: true, enterKeyHint: 'go' }, 'At least 10 characters. A short sentence is easy to remember.')}
        <button className="ra-btn primary" type="submit" disabled={pending || !ready}>{pending ? 'Setting up…' : 'Create my madrasah'}</button>
      </form>
    </main>
  );
}
