'use client';

import { useState, useTransition } from 'react';
import { movePaymentAction } from './actions';

/** §2 "Move Here": moves one payment to another of the student's invoices. */
export function MovePayment({ paymentId, options }: { paymentId: number; options: { value: string; label: string }[] }) {
  const [to, setTo] = useState(options[0]?.value ?? '');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  if (!options.length) return null;
  return (
    <details className="ra-move">
      <summary className="ra-link">Move</summary>
      <span className="ra-toolbar" style={{ marginTop: 6 }}>
        <select className="ra-select" aria-label={`Move payment #${paymentId} to invoice`} value={to} onChange={(e) => setTo(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <button type="button" className="ra-btn" disabled={pending} onClick={() => start(async () => setError((await movePaymentAction(paymentId, Number(to)))?.error ?? ''))}>{pending ? 'Moving…' : 'Move here'}</button>
        {error && <span role="alert" style={{ color: 'var(--color-bad)', fontSize: 12 }}>{error}</span>}
      </span>
    </details>
  );
}
