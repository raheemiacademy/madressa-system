'use client';

import { useActionState, useEffect, useRef } from 'react';
import { kioskAction, type KioskState } from './actions';

export function KioskForm({ teachers }: { teachers: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<KioskState, FormData>(kioskAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  // Clear the PIN and the choice after each go, so the next teacher starts fresh.
  useEffect(() => { if (state) form.current?.reset(); }, [state]);
  if (!teachers.length) return <p className="ra-empty">No teachers have a kiosk PIN yet.</p>;
  return (
    <form ref={form} action={action} className="ra-form" autoComplete="off">
      {state && <p role="status" className={`ra-banner ${state.ok ? 'ra-success' : 'ra-alert'}`} style={{ margin: 0 }}>{state.message}</p>}
      <div className="ra-field"><label htmlFor="k-t">Your name</label>
        <select className="ra-select" id="k-t" name="teacherId" required defaultValue="" style={{ minHeight: 48, fontSize: 16 }}>
          <option value="" disabled>Choose your name</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></div>
      <div className="ra-field"><label htmlFor="k-p">PIN</label>
        <input className="ra-input" id="k-p" name="pin" type="password" inputMode="numeric" pattern="\d*" maxLength={8} required style={{ minHeight: 48, fontSize: 20, letterSpacing: '.3em' }} /></div>
      <button className="ra-btn primary" disabled={pending}>{pending ? 'Checking…' : 'Sign in or out'}</button>
    </form>
  );
}
