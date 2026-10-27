'use client';

import { EA_ROLES, EA_TYPES } from '@/lib/marketing';
import { d } from './bits';
import { usePostForm } from './usePostForm';

/* "Start your free trial" on the homepage, posting to /api/early-access. */
const ID = { school: 'ea-school', name: 'ea-name', role: 'ea-role', email: 'ea-email', students: 'ea-size', type: 'ea-type' };
const OK = 'JazakAllah khair. You’re on the early-access list. We’ll email you soon to set up your madressa.';

export function EarlyAccessForm() {
  const { field, err, statusBox, formProps, busy } = usePostForm(ID, OK);
  return (
    <form {...formProps} className="form" data-rise style={d(1)} action="/api/early-access">
      <h3 className="full form-title">Start your free trial</h3>
      <div className="field full">
        <label htmlFor="ea-school">Madressa or school name</label>
        <input {...field('school')} type="text" autoComplete="organization" required data-required="Please enter your madressa’s name." enterKeyHint="next" />
        {err('school')}
      </div>
      <div className="field">
        <label htmlFor="ea-name">Your name</label>
        <input {...field('name')} type="text" autoComplete="name" required data-required="Please enter your name." enterKeyHint="next" />
        {err('name')}
      </div>
      <div className="field">
        <label htmlFor="ea-role">Your role</label>
        <select {...field('role')}>{EA_ROLES.map((o) => <option key={o}>{o}</option>)}</select>
        {err('role')}
      </div>
      <div className="field">
        <label htmlFor="ea-email">Email</label>
        <input {...field('email')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required data-required="Please enter your email." enterKeyHint="next" />
        {err('email')}
      </div>
      <div className="field">
        <label htmlFor="ea-size">Number of students <span className="hint">(roughly)</span></label>
        <input {...field('students')} type="number" inputMode="numeric" min={1} max={20000} enterKeyHint="done" />
        {err('students')}
      </div>
      <div className="field full">
        <label htmlFor="ea-type">What kind of school?</label>
        <select {...field('type')}>{EA_TYPES.map((o) => <option key={o}>{o}</option>)}</select>
        {err('type')}
      </div>
      {statusBox}
      <button className="btn btn-primary full" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Start free trial'}</button>
      <p className="small full">We’ll only use these details to set up your trial and contact you about it.</p>
    </form>
  );
}
