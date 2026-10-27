'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { signInAction, type SignInState } from '../actions';
import { Brand } from '../_ui/icons';

/**
 * Two screens, one form: email and password, then the 6-digit code. The first screen's fields stay in the form (hidden) so
 * the second sends all three, and the server checks them together.
 */
export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, undefined);
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const card = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state) setStep(state.step); }, [state]);
  useEffect(() => { card.current?.querySelector<HTMLInputElement>(`[data-step="${step}"] input`)?.focus(); }, [step, state]);
  const err = state?.step === step ? state.error ?? '' : '';

  return (
    <main className="signin">
      <form className="signin-card" action={action} noValidate ref={card}>
        <Brand />
        <input type="hidden" name="step" value={step} />
        <div className="contents" data-step="password" hidden={step !== 'password'}>
          <h1>Owner sign-in</h1>
          <p className="note">Only the owner account can sign in here. There is no sign-up.</p>
          <label className="field"><span>Email</span>
            <input className="input" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} enterKeyHint="next"
              value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="si-err" />
          </label>
          <label className="field"><span>Password</span>
            <input className="input" name="password" type="password" autoComplete="current-password" enterKeyHint="go"
              value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="si-err" />
          </label>
        </div>
        <div className="contents" data-step="code" hidden={step !== 'code'}>
          <h1>Enter your code</h1>
          <p className="note">Open your authenticator app and type the 6-digit code for Madressa Owner.</p>
          <label className="field"><span>6-digit code</span>
            <input className="input otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} enterKeyHint="go"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby="si-err" />
          </label>
        </div>
        <p className="err" id="si-err" aria-live="polite">{err}</p>
        <button className="btn primary" type="submit" disabled={pending}>{step === 'code' ? (pending ? 'Signing in…' : 'Sign in') : (pending ? 'Checking…' : 'Continue')}</button>
        {step === 'code' && <button className="link-btn" type="button" onClick={() => { setStep('password'); setCode(''); }}>Back</button>}
      </form>
    </main>
  );
}
