'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { setupAction, type FormState } from '../../actions';
import { Brand, Icon } from '../../_ui/icons';

/** The one-time setup link from `./madrasah owner`: choose a password, add the authenticator key, prove it with one code. */
export function SetupForm({ token, email, keyText, url }: { token: string; email: string; keyText: string; url: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setupAction.bind(null, token), undefined);
  const [v, setV] = useState({ password: '', confirm: '', code: '' });
  const [copied, setCopied] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const e = state?.errors ?? {};
  useEffect(() => {
    const bad = (['password', 'confirm', 'code'] as const).find((k) => e[k]);
    if (bad) form.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps -- focus once per answer from the server
  const input = (k: keyof typeof v) => ({
    name: k, value: v[k], 'aria-invalid': e[k] ? true : undefined, 'aria-describedby': `su-${k}-err`,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: k === 'code' ? ev.target.value.replace(/\D/g, '').slice(0, 6) : ev.target.value })
  });
  const copy = () => navigator.clipboard?.writeText(keyText.replace(/\s/g, '')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});

  return (
    <main className="signin">
      <form className="signin-card" action={action} noValidate ref={form}>
        <Brand />
        <h1>Set up your owner account</h1>
        <p className="note">For <span translate="no">{email}</span>. This link works once.</p>
        {state?.error && <p className="err" role="alert">{state.error}</p>}
        <input type="hidden" name="username" value={email} autoComplete="username" />
        <label className="field"><span>Password <span className="hint">at least 12 characters</span></span>
          <input className="input" type="password" autoComplete="new-password" enterKeyHint="next" {...input('password')} />
        </label>
        <p className="err" id="su-password-err" aria-live="polite">{e.password}</p>
        <label className="field"><span>Repeat password</span>
          <input className="input" type="password" autoComplete="new-password" enterKeyHint="next" {...input('confirm')} />
        </label>
        <p className="err" id="su-confirm-err" aria-live="polite">{e.confirm}</p>
        <ol className="steps">
          <li>Open your authenticator app and add an account.</li>
          <li>Type in this key, or on this phone, <a href={url}>add it to your authenticator app</a>.</li>
        </ol>
        <div className="cmd"><code className="key" aria-label="Authenticator key">{keyText}</code>
          <button className="btn sm" type="button" onClick={copy}><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <label className="field"><span>6-digit code from the app</span>
          <input className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} enterKeyHint="go" {...input('code')} />
        </label>
        <p className="err" id="su-code-err" aria-live="polite">{e.code}</p>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Setting up…' : 'Finish setup'}</button>
      </form>
    </main>
  );
}
