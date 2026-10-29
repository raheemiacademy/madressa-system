'use client';

import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
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
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per result, not when the callback's identity changes
  useEffect(() => { if (state?.ok) onSuccess?.(state); }, [state]);
  return (
    // Submitted through onSubmit, not the action prop: React 19 resets a form after every action-prop submit, which wiped
    // everything typed when one field was wrong. resetOnSuccess still clears the forms that ask for it.
    <form ref={ref} id={id} noValidate className={card ? 'ra-card ra-form' : 'ra-form'} encType={encType}
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); startTransition(() => act(fd)); }}>
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

/**
 * A button that runs a bound server action and shows any error or message.
 * - confirm: an in-app dialog asks first (with lose: what will be lost), for things that can't be got back.
 * - undo: no question; it happens at once with an Undo toast, and the server is called after 5 seconds (or when the page
 *   is left), for things that can be got back. The button's row is hidden meanwhile.
 */
export function ActionButton({ action, label, confirm: ask, lose, undo, danger, className = 'ra-btn', ariaLabel, children }: {
  action: () => Promise<{ error?: string; message?: string } | void>; label?: string; confirm?: string; lose?: string; undo?: string; danger?: boolean; className?: string; ariaLabel?: string; children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const row = () => btn.current?.closest<HTMLElement>('tr, li, article') ?? null;
  const run = () => start(async () => { const r = await action(); if (r?.error) row()?.removeAttribute('hidden'); setError(r?.error ?? ''); setMessage(r?.message ?? ''); });
  const verb = label ?? ariaLabel ?? 'Confirm';
  return (
    <>
      <button ref={btn} type="button" className={`${className}${danger ? ' danger' : ''}`} aria-label={ariaLabel} disabled={pending || waiting}
        onClick={() => {
          if (undo) { row()?.setAttribute('hidden', ''); setWaiting(true); return; }
          if (ask) { dialog.current?.showModal(); return; }
          run();
        }}>
        {children ?? (pending ? 'Working…' : label)}
      </button>
      {ask && (
        <dialog ref={dialog} className="ra-dialog" aria-labelledby={titleId}>
          <h2 id={titleId}>{ask}</h2>
          {lose && <p>{lose}</p>}
          <div className="ra-toolbar">
            <button type="button" className="ra-btn" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" className={danger || /^(delete|remove)/i.test(verb) ? 'ra-btn danger' : 'ra-btn primary'} onClick={() => { dialog.current?.close(); run(); }}>{verb}</button>
          </div>
        </dialog>
      )}
      {waiting && undo && <UndoToast text={undo} onUndo={() => { setWaiting(false); row()?.removeAttribute('hidden'); btn.current?.focus(); }} onCommit={() => { setWaiting(false); run(); }} />}
      {error && <span role="alert" style={{ color: 'var(--color-bad)', fontSize: 12, whiteSpace: 'normal' }}>{error}</span>}
      {message && <span role="status" style={{ fontSize: 12, whiteSpace: 'normal' }}>{message}</span>}
    </>
  );
}

/** "Done. Undo" for 5 seconds, then onCommit. Rendered into <body> so the shell's containers can't trap position: fixed. */
function UndoToast({ text, onUndo, onCommit }: { text: string; onUndo: () => void; onCommit: () => void }) {
  const done = useRef(false);
  const alive = useRef(false);
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });
  useEffect(() => {
    alive.current = true;
    const fire = () => { if (!done.current) { done.current = true; commit.current(); } };
    const t = setTimeout(fire, 5000);
    // Leaving the page early still carries it out. (Checked a tick later, so React's dev double-mount doesn't fire it.)
    return () => { clearTimeout(t); alive.current = false; setTimeout(() => { if (!alive.current) fire(); }, 0); };
  }, []);
  return createPortal(
    <div className="ra-toast" role="status">{text}<button type="button" className="ra-link" onClick={() => { done.current = true; onUndo(); }}>Undo</button></div>,
    document.body
  );
}
