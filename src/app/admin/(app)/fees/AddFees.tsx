'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence, parsePounds } from '@/lib/money';
import { findStudentsAction, paymentOptionsAction, quickSendReceiptAction, recordPaymentAction, type Slip } from './actions';

type Pick = { id: number; name: string };
type Options = Awaited<ReturnType<typeof paymentOptionsAction>>;
const EVENT = 'ra-add-fees';

/** Opens the Add Fees dialog, optionally for one student (and invoice). */
export function AddFeesButton({ student, invoiceId, label = 'Add fees', className = 'ra-btn primary', plus = label === 'Add fees' }: { student?: Pick; invoiceId?: number; label?: string; className?: string; plus?: boolean }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: { student, invoiceId } }))}>
      {plus && <Icon name="plus" />}{label}
    </button>
  );
}

/** §2 "Add Fees" (record a payment), available on every fees page. Rendered once by the fees layout. */
export function AddFeesDialog({ today, methods, statuses }: { today: string; methods: readonly string[]; statuses: readonly string[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [student, setStudent] = useState<Pick | null>(null);
  const [preset, setPreset] = useState<number | undefined>();
  const [opts, setOpts] = useState<Options | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Awaited<ReturnType<typeof findStudentsAction>>>([]);
  const [target, setTarget] = useState('');
  const [round, setRound] = useState(0);
  const [slip, setSlip] = useState<Slip>();
  const [, start] = useTransition();

  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent<{ student?: Pick; invoiceId?: number }>).detail;
      setStudent(d.student ?? null); setPreset(d.invoiceId); setSlip(undefined); setOpts(null); setQ(''); setFound([]); setRound((r) => r + 1);
      dlg.current?.showModal();
    };
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);
  useEffect(() => {
    if (!student) return;
    start(async () => { const o = await paymentOptionsAction(student.id); setOpts(o); setTarget(preset && o.invoices.some((i) => i.id === preset) ? String(preset) : o.invoices[0] ? String(o.invoices[0].id) : 'oldest'); });
  }, [student, preset, round]);
  useEffect(() => {
    if (student || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => start(async () => setFound(await findStudentsAction(q))), 250);
    return () => clearTimeout(t);
  }, [q, student]);

  return (
    <dialog ref={dlg} className="ra-dialog" aria-labelledby="addfees-h" style={{ width: 'min(600px, calc(100vw - 32px))' }}>
      <div className="ra-card-h"><div><h2 id="addfees-h">Add fees</h2><p className="ra-note">Record a payment against an invoice.</p></div>
        <button type="button" className="ra-icon-btn" aria-label="Close" onClick={() => dlg.current?.close()}><span aria-hidden="true">×</span></button></div>
      {!student ? (
        <div className="ra-form">
          <div className="ra-field"><label htmlFor="addfees-q">Find a student</label>
            <input id="addfees-q" className="ra-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or student ID" autoComplete="off" /></div>
          {q.trim().length >= 2 && (found.length === 0 ? <p className="ra-empty">No students match.</p> : (
            <ul className="ra-picklist" aria-label="Matching students">
              {found.map((s) => <li key={s.id}><button type="button" className="ra-btn" onClick={() => setStudent({ id: s.id, name: s.name })}>{s.name} <span className="ra-muted">#{s.id} · {s.status}</span></button></li>)}
            </ul>
          ))}
        </div>
      ) : (
        <>
        <Form key={`${student.id}-${round}`} action={recordPaymentAction} card={false} savebar={false} submit="Record payment" resetOnSuccess
          onSuccess={(s) => setSlip((s as { slip?: Slip }).slip)}>
          <input type="hidden" name="studentId" value={student.id} />
          <p style={{ margin: 0 }}><strong>{student.name}</strong> · <Link className="ra-link" href={`/admin/fees/student/${student.id}`} onClick={() => dlg.current?.close()}>Fees</Link> · <button type="button" className="ra-link" onClick={() => { setStudent(null); setSlip(undefined); }}>Change student</button></p>
          {!opts ? <p className="ra-note" role="status">Loading invoices…</p> : (
            <>
              {opts.family.map((f) => <input key={f.id} type="hidden" name="familyIds" value={f.id} />)}
              <div className="ra-fields">
                <SelectField name="invoiceId" label="Pay towards" full value={target} onChange={(e) => setTarget(e.target.value)}
                  options={[...opts.invoices.map((i) => ({ value: String(i.id), label: i.label })), { value: 'oldest', label: 'Oldest unpaid invoices first' },
                    ...(opts.family.length ? [{ value: 'family', label: `Oldest unpaid first, with ${opts.family.map((f) => f.name).join(', ')}` }] : [])]} />
                <TextField name="amount" label="Amount (£)" inputMode="decimal" autoComplete="off" />
                <TextField name="receivedOn" label="Date received" type="date" defaultValue={today} max={today} />
                <SelectField name="method" label="Method" options={methods.map((m) => ({ value: m, label: m }))} />
                <SelectField name="status" label="Status" options={statuses.map((m) => ({ value: m, label: m }))} defaultValue="Cleared" />
                <TextField name="reference" label="Reference" autoComplete="off" />
                <TextField name="note" label="Note" autoComplete="off" />
              </div>
              {opts.invoices.length === 0 && <p className="ra-note">Nothing is owed by {student.name} right now. Create an invoice first.</p>}
            </>
          )}
        </Form>
        {/* The receipt slides out under the form, like a till printing it. */}
        {slip && (
          <div className="ra-rcpt-slot">
            <div className="ra-rcpt" role="status" aria-label="Receipt">
              <div className="ra-note">Receipt {slip.receipts.map((id) => `R${id}`).join(', ')} · {slip.method} · {formatCalendarDate(slip.on)}</div>
              <div className="ra-rcpt-row"><span>{student.name}</span><span className="amt">{formatPence(parsePounds(slip.amount) ?? 0)}</span></div>
              <div className="ra-rcpt-row ra-note"><span>{slip.family ? 'Family balance now' : 'Balance now'}</span><span>{formatPence(slip.left)}{slip.left ? '' : ' ✓'}</span></div>
              <div className="ra-toolbar">
                {slip.receipts.map((id) => <Link key={id} className="ra-btn" href={`/admin/fees/receipt/${id}`} onClick={() => dlg.current?.close()}><Icon name="receipt" />Open receipt{slip.receipts.length > 1 ? ` R${id}` : ''}</Link>)}
                {slip.receipts.length === 1 && <ActionButton action={quickSendReceiptAction.bind(null, slip.receipts[0]!)} label="Email to parent" />}
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </dialog>
  );
}
