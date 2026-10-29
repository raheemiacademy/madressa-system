'use client';

import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import type { FormState } from '@/lib/validate';

/** The conversation list's tick boxes: a bar with what to do appears only once something is ticked. */
export function BulkForm({ action, canDelete, children }: { action: (p: FormState, fd: FormData) => Promise<FormState>; canDelete: boolean; children: React.ReactNode }) {
  const [state, act] = useActionState<FormState, FormData>(action, undefined);
  const [, startTransition] = useTransition();
  const [n, setN] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const clear = () => { form.current?.reset(); setN(0); };
  useEffect(() => { dialog.current?.close(); if (state?.ok) clear(); }, [state]);
  const some = n === 1 ? '1 conversation' : `${n} conversations`;
  return (
    <form ref={form} className="ra-form" noValidate onChange={() => setN(form.current?.querySelectorAll('input[name="ids"]:checked').length ?? 0)}
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); startTransition(() => act(fd)); }}>
      {children}
      {n > 0 && (
        <div className="ra-bulk" role="group" aria-label="Selected conversations">
          <b aria-live="polite">{n} selected</b>
          <button className="ra-link" name="op" value="read">Mark read</button>
          <button className="ra-link" name="op" value="unread">Mark unread</button>
          <button className="ra-link" name="op" value="lock">Archive</button>
          <button className="ra-link" name="op" value="unlock">Unlock</button>
          {canDelete && <button type="button" className="ra-link" style={{ color: 'var(--color-bad)' }} onClick={() => dialog.current?.showModal()}>Delete</button>}
          <button type="button" className="ra-link" onClick={clear}>Clear</button>
        </div>
      )}
      {canDelete && (
        <dialog ref={dialog} className="ra-dialog" aria-labelledby={titleId}>
          <h2 id={titleId}>Delete {some} for everyone?</h2>
          <p>Every message in {n === 1 ? 'it' : 'them'}, and any attachments, will be gone for the parents, teachers and every admin. This can’t be undone.</p>
          <div className="ra-toolbar">
            <button type="button" className="ra-btn" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="ra-btn danger" name="op" value="delete">Delete {some}</button>
          </div>
        </dialog>
      )}
      {state?.message && <span role="status" className="ra-note" style={{ color: state.ok ? undefined : 'var(--color-bad)' }}>{state.message}</span>}
    </form>
  );
}
