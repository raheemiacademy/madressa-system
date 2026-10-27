'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { changePasswordAction, confirmResetAction, type FormState, signOutEverywhereAction, startResetAction } from '../../actions';
import { Sheet, useToast } from '../../_ui/Sheet';

export type SessionRow = { device: string; detail: string; when: string };

export function Account({ sessions }: { sessions: SessionRow[] }) {
  const { toast, toastBox } = useToast();
  const [pw, pwAction, pwPending] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  const [sheet, setSheet] = useState<null | 'reset' | 'signout'>(null);
  const pwForm = useRef<HTMLFormElement>(null);
  const pwErr = pw?.error ?? Object.values(pw?.errors ?? {})[0] ?? '';
  useEffect(() => {
    if (pw?.ok) toast(pw.ok);
    const bad = (['current', 'next', 'repeat'] as const).find((k) => pw?.errors?.[k]);
    if (bad) pwForm.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
  }, [pw, toast]);
  const close = () => setSheet(null);

  return (
    <div className="grid">
      <section className="card c6" aria-labelledby="h-pw">
        <div className="card-h"><h2 id="h-pw">Change password</h2></div>
        <form className="contents" action={pwAction} noValidate ref={pwForm}>
          <label className="field"><span>Current password</span><input className="input" type="password" name="current" autoComplete="current-password" aria-invalid={pw?.errors?.current ? true : undefined} aria-describedby="pw-err" /></label>
          <label className="field"><span>New password <span className="hint">at least 12 characters</span></span><input className="input" type="password" name="next" autoComplete="new-password" minLength={12} aria-invalid={pw?.errors?.next ? true : undefined} aria-describedby="pw-err" /></label>
          <label className="field"><span>Repeat new password</span><input className="input" type="password" name="repeat" autoComplete="new-password" aria-invalid={pw?.errors?.repeat ? true : undefined} aria-describedby="pw-err" /></label>
          <p className="err" id="pw-err" aria-live="polite">{pwErr}</p>
          <button className="btn primary" type="submit" disabled={pwPending} style={{ alignSelf: 'flex-start' }}>{pwPending ? 'Changing…' : 'Change password'}</button>
        </form>
      </section>

      <section className="card c6" aria-labelledby="h-sec">
        <div className="card-h"><h2 id="h-sec">Security</h2></div>
        <div className="actions">
          <div className="action"><div><b>Reset the authenticator</b><small>You’ll set up a new 6-digit code on your phone.</small></div><button className="btn" type="button" onClick={() => setSheet('reset')}>Reset</button></div>
          <div className="action"><div><b>Sign out everywhere</b><small>Every other device has to sign in again.</small></div><button className="btn danger" type="button" onClick={() => setSheet('signout')}>Sign out</button></div>
        </div>
        <h3 style={{ margin: '8px 0 0', fontSize: 14 }}>Where you’re signed in</h3>
        <ul className="list">
          {sessions.map((s, i) => <li key={i} className="opt"><span><b>{s.device}</b><small>{s.detail}</small></span><span className="note">{s.when}</span></li>)}
        </ul>
      </section>

      {sheet === 'reset' && <ResetSheet onClose={close} onDone={() => { close(); toast('New authenticator key ready. Use its codes from now on.'); }} />}
      {sheet === 'signout' && (
        <Sheet title="Sign out everywhere?" onClose={close}>
          <p>Every device, including this one, has to sign in again with your password and code.</p>
          <form className="btn-row" action={signOutEverywhereAction}>
            <button className="btn" type="button" onClick={close}>Cancel</button>
            <button className="btn danger" type="submit" data-autofocus>Sign out everywhere</button>
          </form>
        </Sheet>
      )}
      {toastBox}
    </div>
  );
}

/** Confirm, then show the new key; one code from it switches over. Until then the old codes still work. */
function ResetSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState<{ key: string; url: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState('');
  const [state, action, pending] = useActionState<FormState, FormData>(confirmResetAction, undefined);
  const [code, setCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state?.ok) onDone(); else if (state?.errors?.code) codeRef.current?.focus(); }, [state, onDone]);
  useEffect(() => { if (key) codeRef.current?.focus(); }, [key]);
  const start = async () => {
    setStarting(true); setFailed('');
    try { setKey(await startResetAction()); } catch { setFailed('That didn’t work. Check your connection and try again.'); } finally { setStarting(false); }
  };

  if (!key) return (
    <Sheet title="Reset the authenticator?" onClose={onClose}>
      <p>Your current 6-digit codes stop working. You’ll get a new key to add to your authenticator app straight away.</p>
      <p className="err" aria-live="polite">{failed}</p>
      <div className="btn-row">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn danger" type="button" onClick={start} disabled={starting} data-autofocus>{starting ? 'Resetting…' : 'Reset'}</button>
      </div>
    </Sheet>
  );
  return (
    <Sheet title="Add the new key" onClose={onClose}>
      <p className="note">Add it to your authenticator app, then type the code it shows. Your old codes work until you do.</p>
      <div className="cmd"><code className="key" aria-label="New authenticator key">{key.key}</code></div>
      <p className="note">On this phone? <a href={key.url}>Add it to your authenticator app</a>.</p>
      <form className="contents" action={action} noValidate>
        <label className="field"><span>6-digit code from the new key</span>
          <input ref={codeRef} className="input otp" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} enterKeyHint="go"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={state?.errors?.code ? true : undefined} aria-describedby="rs-err" />
        </label>
        <p className="err" id="rs-err" aria-live="polite">{state?.errors?.code}</p>
        <div className="btn-row">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Checking…' : 'Use the new key'}</button>
        </div>
      </form>
    </Sheet>
  );
}
