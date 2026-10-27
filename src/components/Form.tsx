'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { FormState } from '@/lib/validate';
import { FormErrors, FormMessage } from './Fields';
import { SaveBar } from './SaveBar';

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/**
 * A card form bound to a server action. Field components pick up their errors from the result,
 * so pages can stay server components. The action redirects or returns { ok, message, errors }.
 */
export function Form({ action, children, submit = 'Save changes', card = true, resetOnSuccess = false, savebar = true, id, encType, onSuccess }: {
  action: Action; children: React.ReactNode; submit?: string; card?: boolean; resetOnSuccess?: boolean; savebar?: boolean; id?: string; encType?: string;
  onSuccess?: (state: NonNullable<FormState>) => void;
}) {
  const [state, act, pending] = useActionState<FormState, FormData>(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per result, not when the callback's identity changes
  useEffect(() => { if (state?.ok) onSuccess?.(state); }, [state]);
  return (
    <form ref={ref} id={id} action={act} noValidate className={card ? 'ra-card ra-form' : 'ra-form'} encType={encType}>
      <FormErrors.Provider value={state?.errors}>
        <FormMessage state={state} />
        {children}
        {savebar ? <SaveBar pending={pending} state={state} label={submit} /> : (
          <div className="ra-toolbar">
            <button className="ra-btn primary" disabled={pending}>{pending ? 'Working…' : submit}</button>
            <span role="status" aria-live="polite" style={state?.ok ? undefined : { color: 'var(--color-bad)' }}>{pending ? '' : state?.message}</span>
          </div>
        )}
      </FormErrors.Provider>
    </form>
  );
}

/** A button that runs a bound server action, optionally after a confirm prompt, and shows any error or message. */
export function ActionButton({ action, label, confirm: ask, danger, className = 'ra-btn', ariaLabel, children }: {
  action: () => Promise<{ error?: string; message?: string } | void>; label?: string; confirm?: string; danger?: boolean; className?: string; ariaLabel?: string; children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <>
      <button type="button" className={`${className}${danger ? ' danger' : ''}`} aria-label={ariaLabel} disabled={pending}
        onClick={() => { if (ask && !window.confirm(ask)) return; start(async () => { const r = await action(); setError(r?.error ?? ''); setMessage(r?.message ?? ''); }); }}>
        {children ?? (pending ? 'Working…' : label)}
      </button>
      {error && <span role="alert" style={{ color: 'var(--color-bad)', fontSize: 12, whiteSpace: 'normal' }}>{error}</span>}
      {message && <span role="status" style={{ fontSize: 12, whiteSpace: 'normal' }}>{message}</span>}
    </>
  );
}
