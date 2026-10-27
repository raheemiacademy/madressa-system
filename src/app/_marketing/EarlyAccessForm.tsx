'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTACT_EMAIL, EA_ROLES, EA_TYPES } from '@/lib/marketing';
import { d } from './bits';

/*
 * "Start your free trial": checks each field where it is (on leaving it, and as it's corrected), posts JSON to /api/early-access,
 * shows the server's field errors under their fields, and says what happened. The messages are the reference site's.
 */
type Field = 'school' | 'name' | 'role' | 'email' | 'students' | 'type';
const ID: Record<Field, string> = { school: 'ea-school', name: 'ea-name', role: 'ea-role', email: 'ea-email', students: 'ea-size', type: 'ea-type' };
const OK = 'JazakAllah khair. You’re on the early-access list. We’ll email you soon to set up your madressa.';
const FAILED = `We couldn’t send this just now. Please try again in a minute, or email us at ${CONTACT_EMAIL}.`;
const CHECK = 'Please check the highlighted field.';
type Control = HTMLInputElement | HTMLSelectElement;

function problem(input: Control) {
  const v = input.validity;
  if (v.valueMissing) return input.dataset.required || 'Please fill this in.';
  if (v.typeMismatch && input.type === 'email') return 'Enter an email address like name@example.org.';
  if (v.rangeUnderflow || v.badInput) return 'Enter a number, or leave it blank.';
  return '';
}

export function EarlyAccessForm() {
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhanced, setEnhanced] = useState(false); // the browser's own validation stays on until this script runs
  const statusRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => setEnhanced(true), []);

  const check = (input: Control) => { const msg = problem(input); setErrors((e) => ({ ...e, [input.name]: msg })); return !msg; };
  const focusField = (f: Field) => formRef.current?.querySelector<Control>(`#${ID[f]}`)?.focus();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found: Partial<Record<Field, string>> = {};
    let first: Control | null = null;
    for (const input of form.querySelectorAll<Control>('.input')) {
      found[input.name as Field] = problem(input);
      if (found[input.name as Field] && !first) first = input;
    }
    setErrors(found);
    if (first) { first.focus(); setStatus({ kind: 'error', text: CHECK }); return; }
    setBusy(true); setStatus(null);
    const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
    let focusStatus = true;
    try {
      const r = await fetch(form.getAttribute('action')!, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      if (r.status === 422) {
        const server = ((await r.json()) as { errors?: Partial<Record<Field, string>> }).errors ?? {};
        setErrors(server);
        setStatus({ kind: 'error', text: CHECK });
        const bad = (Object.keys(ID) as Field[]).find((f) => server[f]);
        if (bad) { focusField(bad); focusStatus = false; }
      } else if (!r.ok) throw new Error(String(r.status));
      else { setStatus({ kind: 'ok', text: OK }); form.reset(); setErrors({}); }
    } catch {
      setStatus({ kind: 'error', text: FAILED });
    } finally {
      setBusy(false);
      if (focusStatus) statusRef.current?.focus();
    }
  }

  const describe = (f: Field) => ({
    id: ID[f], name: f, className: 'input', 'aria-describedby': `${ID[f]}-err`,
    'aria-invalid': f in errors ? (errors[f] ? 'true' as const : 'false' as const) : undefined,
    onBlur: (e: { currentTarget: Control }) => { if (e.currentTarget.value) check(e.currentTarget); },
    onInput: (e: { currentTarget: Control }) => { if (errors[f]) check(e.currentTarget); }
  });
  const err = (f: Field) => <p className="err" id={`${ID[f]}-err`} aria-live="polite">{errors[f]}</p>;

  return (
    <form ref={formRef} className="form" data-rise style={d(1)} action="/api/early-access" method="post" noValidate={enhanced} onSubmit={submit}>
      <h3 className="full form-title">Start your free trial</h3>
      <div className="field full">
        <label htmlFor="ea-school">Madressa or school name</label>
        <input {...describe('school')} type="text" autoComplete="organization" required data-required="Please enter your madressa’s name." enterKeyHint="next" />
        {err('school')}
      </div>
      <div className="field">
        <label htmlFor="ea-name">Your name</label>
        <input {...describe('name')} type="text" autoComplete="name" required data-required="Please enter your name." enterKeyHint="next" />
        {err('name')}
      </div>
      <div className="field">
        <label htmlFor="ea-role">Your role</label>
        <select {...describe('role')}>{EA_ROLES.map((o) => <option key={o}>{o}</option>)}</select>
        {err('role')}
      </div>
      <div className="field">
        <label htmlFor="ea-email">Email</label>
        <input {...describe('email')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required data-required="Please enter your email." enterKeyHint="next" />
        {err('email')}
      </div>
      <div className="field">
        <label htmlFor="ea-size">Number of students <span className="hint">(roughly)</span></label>
        <input {...describe('students')} type="number" inputMode="numeric" min={1} max={20000} enterKeyHint="done" />
        {err('students')}
      </div>
      <div className="field full">
        <label htmlFor="ea-type">What kind of school?</label>
        <select {...describe('type')}>{EA_TYPES.map((o) => <option key={o}>{o}</option>)}</select>
        {err('type')}
      </div>
      <div className="form-status" role="status" tabIndex={-1} ref={statusRef} data-kind={status?.kind}>{status?.text}</div>
      <button className="btn btn-primary full" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Start free trial'}</button>
      <p className="small full">We’ll only use these details to set up your trial and contact you about it.</p>
    </form>
  );
}
