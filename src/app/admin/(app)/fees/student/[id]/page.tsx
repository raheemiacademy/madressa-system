import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academicYear, contact, feeAdjustment, INVOICE_TYPES, invoice, student, studentContact } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { SelectField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { describeAdjustment } from '@/server/fees/adjustments';
import { invoiceRows, paymentsFor, totals, type InvoiceRow } from '@/server/fees/invoices';
import { listStructures } from '@/server/fees/structures';
import { yearAndClasses } from '../../../students/year-classes';
import { adHocAction, deleteInvoiceAction, processPaymentsAction } from '../../actions';
import { AddFeesButton } from '../../AddFees';
import { MovePayment } from '../../MovePayment';

export const metadata = { title: 'Student fees' };
const VIEWS = { invoices: 'Invoice view', report: 'Report view', history: 'Full history' } as const;
const d = (iso: string | null) => (iso ? formatCalendarDate(iso) : '');

export default async function StudentFees({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; type?: string }> }) {
  const admin = await requireAdmin('fees');
  const id = Number((await params).id);
  const sp = await searchParams;
  const view = (sp.view && sp.view in VIEWS ? sp.view : 'invoices') as keyof typeof VIEWS;
  const type = (INVOICE_TYPES as readonly string[]).includes(sp.type ?? '') ? sp.type as (typeof INVOICE_TYPES)[number] : undefined;
  const [s] = Number.isInteger(id) ? await db.select().from(student).where(eq(student.id, id)).limit(1) : [];
  if (!s) notFound();
  const name = `${s.firstName} ${s.surname}`;
  const { year } = await yearAndClasses();
  const inYear = view === 'history' || !year ? undefined : eq(invoice.academicYearId, year.id);
  const [rows, contacts, [adj], years, adhoc] = await Promise.all([
    invoiceRows(db, and(eq(invoice.studentId, id), inYear, type ? eq(invoice.type, type) : undefined)),
    db.select({ c: contact, l: studentContact }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).where(eq(studentContact.studentId, id)).orderBy(asc(studentContact.sortOrder)),
    db.select().from(feeAdjustment).where(eq(feeAdjustment.studentId, id)),
    db.select().from(academicYear).orderBy(asc(academicYear.startsOn)),
    year ? listStructures(db, year.id).then((x) => x.filter((st) => st.isAdHoc)) : Promise.resolve([])
  ]);
  const pays = await paymentsFor(db, rows.map((r) => r.id));
  const t = totals(rows);
  const canDelete = adminCan(admin.staff, 'delete');
  const moveOptions = (from: number) => rows.filter((r) => r.id !== from).map((r) => ({ value: String(r.id), label: `#${r.id} · ${r.description ?? r.type}` }));
  const q = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ view, type, ...v }).filter(([, x]) => x) as [string, string][])}`;

  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{name}: fees</h1><p>Student #{s.id} · {s.status} · Adjustment: {describeAdjustment(adj)}</p></div>
        <div className="ra-toolbar">
          <AddFeesButton student={{ id, name }} label="Add payment" />
          <Link className="ra-btn" href={`/admin/fees/invoice?student=${id}`}><Icon name="plus" />Create manual invoice</Link>
          <Link className="ra-btn" href={`/admin/fees/family?student=${id}`}>Siblings view</Link>
          <Link className="ra-btn" href={`/admin/students/${id}`}>Student profile</Link>
          <Link className="ra-btn" href="/admin/fees">Fees</Link>
        </div></div>

      <div className="ra-kpis">
        <div className="ra-kpi"><div className="ra-kpi-top">Total due</div><div className="ra-kpi-val">{formatPence(t.due)}</div><div className="ra-kpi-sub">{rows.length === 1 ? '1 invoice' : `${rows.length} invoices`}{view !== 'history' && year ? ` in ${year.title}` : ''}</div></div>
        <div className="ra-kpi"><div className="ra-kpi-top">Total received</div><div className="ra-kpi-val">{formatPence(t.received)}</div><div className="ra-kpi-sub">{t.pending ? `${formatPence(t.pending)} pending` : 'Cleared payments'}</div></div>
        <div className="ra-kpi"><div className="ra-kpi-top">Total overdue</div><div className={`ra-kpi-val${t.overdue ? ' ra-warn' : ''}`}>{formatPence(t.overdue)}</div><div className="ra-kpi-sub">Overdue invoices only</div></div>
      </div>

      <nav className="ra-filters no-print" aria-label="Fees view">
        {Object.entries(VIEWS).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={view === k ? 'page' : undefined} href={q({ view: k })}>{l}</Link>)}
      </nav>
      <nav className="ra-filters no-print" aria-label="Invoice type">
        <Link className="ra-filter" aria-current={!type ? 'page' : undefined} href={q({ type: undefined })}>All types</Link>
        {INVOICE_TYPES.map((x) => <Link key={x} className="ra-filter" aria-current={type === x ? 'page' : undefined} href={q({ type: x })}>{x}</Link>)}
      </nav>

      {view === 'invoices' && (rows.length === 0 ? <p className="ra-empty">No invoices{type ? ` of type ${type}` : ''}{year ? ` in ${year.title}` : ''} yet.</p> : (
        <Form action={processPaymentsAction.bind(null, 'Student fees')} card={false} savebar={false} submit="Process">
          {rows.map((r) => <InvoiceCard key={r.id} r={r} pays={pays.filter((p) => p.invoiceId === r.id)} studentName={name} canDelete={canDelete} moveOptions={moveOptions(r.id)} />)}
          {pays.length > 0 && (
            <div className="ra-card ra-toolbar" style={{ background: 'var(--ra-tint)' }}>
              <SelectField name="op" label="Selected payments" options={[{ value: 'Cleared', label: 'Mark complete / received' }, { value: 'Pending', label: 'Mark pending' }, ...(canDelete ? [{ value: 'delete', label: 'Delete' }] : [])]} />
            </div>
          )}
        </Form>
      ))}

      {view === 'report' && <Statement rows={rows} pays={pays} />}

      {view === 'history' && (
        <section className="ra-card" aria-labelledby="hist-h">
          <div className="ra-card-h"><div><h2 id="hist-h">Full history</h2><div className="ra-note">Every year’s invoices and payments for {name}</div></div><PrintButton label="Download PDF fees history" /></div>
          {rows.length === 0 ? <p className="ra-empty">No invoices yet.</p> : years.filter((y) => rows.some((r) => r.academicYearId === y.id)).map((y) => {
            const yr = rows.filter((r) => r.academicYearId === y.id);
            const yt = totals(yr);
            return (
              <div key={y.id} style={{ marginTop: 12 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{y.title}: invoiced {formatPence(yt.due)}, paid {formatPence(yt.received)}, balance {formatPence(yt.due - yt.received)}</h3>
                <Statement rows={yr} pays={pays} plain />
              </div>
            );
          })}
        </section>
      )}

      <div className="ra-grid no-print">
        {adhoc.length > 0 && (
          <section className="ra-card ra-c6" aria-labelledby="adhoc-h">
            <div className="ra-card-h"><div><h2 id="adhoc-h">Create ad hoc invoices</h2><div className="ra-note">Bill this student for every invoice in an ad hoc structure. Invoices already made aren’t repeated.</div></div></div>
            <Form action={adHocAction.bind(null, id)} card={false} savebar={false} submit="Create invoices">
              <SelectField name="structureId" label="Ad hoc structure" options={adhoc.map((x) => ({ value: String(x.id), label: x.name }))} />
            </Form>
          </section>
        )}
        <section className="ra-card ra-c6" aria-labelledby="sc-h">
          <div className="ra-card-h"><div><h2 id="sc-h">Student contacts</h2><div className="ra-note">Invoices are addressed to the primary contact unless one is chosen on the invoice</div></div></div>
          {contacts.length === 0 ? <p className="ra-empty">No contacts yet.</p> : (
            <ul className="ra-list">{contacts.map(({ c, l }) => <li key={c.id}><Link href={`/admin/contacts/${c.id}`}>{c.name}</Link> <span className="ra-muted">{l.relation ?? l.type}{l.isPrimary ? ' · primary' : ''}{c.email ? ` · ${c.email}` : ''}{c.mobile ? ` · ${c.mobile}` : ''}</span></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}

function InvoiceCard({ r, pays, studentName, canDelete, moveOptions }: { r: InvoiceRow; pays: Awaited<ReturnType<typeof paymentsFor>>; studentName: string; canDelete: boolean; moveOptions: { value: string; label: string }[] }) {
  return (
    <section className="ra-card ra-invoice" aria-labelledby={`inv-${r.id}`}>
      <div className="ra-card-h">
        <div><h2 id={`inv-${r.id}`}>#{r.id} · {r.description ?? r.type}</h2>
          <div className="ra-note">{r.type} · issued {d(r.invoiceDate)} · due {d(r.dueDate)}{r.periodFrom ? ` · period ${d(r.periodFrom)} to ${d(r.periodTo)}` : ''}</div></div>
        <Chip>{r.status}</Chip>
      </div>
      <div className="ra-inv-sum">
        <span>Amount <b>{formatPence(r.amountPence)}</b></span><span>Received <b>{formatPence(r.received)}</b></span>
        {r.pending > 0 && <span>Pending <b>{formatPence(r.pending)}</b></span>}<span>Balance <b>{formatPence(Math.max(0, r.balance))}</b></span>
      </div>
      {pays.length > 0 && (
        <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
          <thead><tr><th><span className="sr-only">Select</span></th><th>Payment</th><th>Date</th><th className="num">Amount</th><th>Method</th><th>Status</th><th>Reference</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{pays.map((p) => (
            <tr key={p.id}>
              <td><input type="checkbox" name="ids" value={p.id} aria-label={`Select payment #${p.id}`} /></td>
              <td className="ra-muted">#{p.id}</td><td>{d(p.receivedOn)}</td><td className="num">{formatPence(p.amountPence)}</td><td>{p.method}</td><td><Chip>{p.status}</Chip></td>
              <td className="wrap">{p.reference ?? ''}</td>
              <td><span className="ra-acts"><Link href={`/admin/fees/receipt/${p.id}`} aria-label={`Receipt for payment #${p.id}`}><Icon name="receipt" /></Link><MovePayment paymentId={p.id} options={moveOptions} /></span></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="ra-toolbar">
        <Link className="ra-btn" href={`/admin/fees/invoice?edit=${r.id}`}><Icon name="edit" />Edit invoice</Link>
        {r.balance > 0 && <AddFeesButton student={{ id: r.studentId, name: studentName }} invoiceId={r.id} label="Add payment" className="ra-btn" />}
        {canDelete && pays.length === 0 && <ActionButton action={deleteInvoiceAction.bind(null, r.id)} label="Delete invoice" danger confirm={`Delete invoice #${r.id}? It won’t be generated again unless you force generate.`} />}
      </div>
    </section>
  );
}

/** Report view: a statement with a running balance, invoices and payments in date order. Only cleared payments reduce it. */
function Statement({ rows, pays, plain }: { rows: InvoiceRow[]; pays: Awaited<ReturnType<typeof paymentsFor>>; plain?: boolean }) {
  const lines = [
    ...rows.map((r) => ({ date: r.invoiceDate, key: `i${r.id}`, text: `Invoice #${r.id}: ${r.description ?? r.type}`, debit: r.amountPence, credit: 0, note: `due ${d(r.dueDate)}` })),
    ...pays.filter((p) => rows.some((r) => r.id === p.invoiceId)).map((p) => ({ date: p.receivedOn, key: `p${p.id}`, text: `Payment #${p.id} (${p.method}) on #${p.invoiceId}`, debit: 0, credit: p.status === 'Cleared' ? p.amountPence : 0, note: p.status }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  let bal = 0;
  if (!lines.length) return <p className="ra-empty">No invoices yet.</p>;
  const table = (
    <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
      <thead><tr><th>Date</th><th>Entry</th><th className="num">Invoiced</th><th className="num">Received</th><th className="num">Balance</th></tr></thead>
      <tbody>{lines.map((l) => { bal += l.debit - l.credit; return (
        <tr key={l.key}><td>{d(l.date)}</td><td className="wrap">{l.text} <span className="ra-muted">{l.note}</span></td>
          <td className="num">{l.debit ? formatPence(l.debit) : ''}</td><td className="num">{l.credit ? formatPence(l.credit) : ''}</td><td className="num">{formatPence(bal)}</td></tr>
      ); })}</tbody>
    </table></div>
  );
  return plain ? table : <section className="ra-card" aria-label="Statement">{table}</section>;
}
