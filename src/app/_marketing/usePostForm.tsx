'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTACT_EMAIL } from '@/lib/marketing';

/*
 * The marketing forms (early access, contact): check each field where it is (on leaving it, and as it's corrected), post
 * JSON to the form's action, show the server's field errors under their fields, and say what happened. The messages are
 * the reference site's.
 */
const FAILED = `We couldn’t send this just now. Please try again in a minute, or email us at ${CONTACT_EMAIL}.`;
const CHECK = 'Please check the highlighted field.';
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function problem(input: Control) {
  const v = input.validity;
  if (v.valueMissing) return input.dataset.required || 'Please fill this in.';
  if (v.typeMismatch && input.type === 'email') return 'Enter an email address like name@example.org.';
  if (v.rangeUnderflow || v.badInput) return 'Enter a number, or leave it blank.';
  return '';
}

/** `ids` maps each field name to its element id, in the order the form shows them. `ok` is said after a successful send. */
export function usePostForm<F extends string>(ids: Record<F, string>, ok: string) {
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhanced, setEnhanced] = useState(false); // the browser's own validation stays on until this script runs
  const statusRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const focusStatusNext = useRef(false);
  useEffect(() => setEnhanced(true), []);
  // The status box is hidden while empty, so it can only take focus once the new message has rendered.
  useEffect(() => { if (focusStatusNext.current) { focusStatusNext.current = false; statusRef.current?.focus(); } }, [status]);

  const check = (input: Control) => { const msg = problem(input); setErrors((e) => ({ ...e, [input.name]: msg })); return !msg; };
  const focusField = (f: F) => formRef.current?.querySelector<Control>(`#${ids[f]}`)?.focus();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found: Partial<Record<F, string>> = {};
    let first: Control | null = null;
    for (const input of form.querySelectorAll<Control>('.input')) {
      found[input.name as F] = problem(input);
      if (found[input.name as F] && !first) first = input;
    }
    setErrors(found);
    if (first) { first.focus(); setStatus({ kind: 'error', text: CHECK }); return; }
    setBusy(true); setStatus(null);
    const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
    let focusStatus = true;
    try {
      const r = await fetch(form.getAttribute('action')!, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      if (r.status === 422) {
        const server: Partial<Record<F, string>> = ((await r.json()) as { errors?: Partial<Record<F, string>> }).errors ?? {};
        setErrors(server);
        setStatus({ kind: 'error', text: CHECK });
        const bad = (Object.keys(ids) as F[]).find((f) => server[f]);
        if (bad) { focusField(bad); focusStatus = false; }
      } else if (!r.ok) throw new Error(String(r.status));
      else { setStatus({ kind: 'ok', text: ok }); form.reset(); setErrors({}); }
    } catch {
      setStatus({ kind: 'error', text: FAILED });
    } finally {
      setBusy(false);
      focusStatusNext.current = focusStatus;
    }
  }

  /** Props for a field's control: id, name, error wiring and the in-place checks. */
  const field = (f: F) => ({
    id: ids[f], name: f, className: 'input', 'aria-describedby': `${ids[f]}-err`,
    'aria-invalid': f in errors ? (errors[f] ? 'true' as const : 'false' as const) : undefined,
    onBlur: (e: { currentTarget: Control }) => { if (e.currentTarget.value) check(e.currentTarget); },
    onInput: (e: { currentTarget: Control }) => { if (errors[f]) check(e.currentTarget); }
  });
  const err = (f: F) => <p className="err" id={`${ids[f]}-err`} aria-live="polite">{errors[f]}</p>;
  const statusBox = <div className="form-status" role="status" tabIndex={-1} ref={statusRef} data-kind={status?.kind}>{status?.text}</div>;
  const formProps = { ref: formRef, method: 'post', noValidate: enhanced, onSubmit };

  return { field, err, statusBox, formProps, busy };
}
