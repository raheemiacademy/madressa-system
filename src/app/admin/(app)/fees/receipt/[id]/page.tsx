import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { contact, invoice, payment, student, studentContact } from '@/db/schema';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { getProfile } from '@/server/profile';
import { readTab } from '@/server/settings';
import { invoiceRows } from '@/server/fees/invoices';

export const metadata = { title: 'Receipt' };

/** A printable receipt for one payment. The receipt number is the payment ID. */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('fees');
  const id = Number((await params).id);
  const [p] = Number.isInteger(id) ? await db.select().from(payment).where(eq(payment.id, id)).limit(1) : [];
  if (!p) notFound();
  const [[inv], profile, fees] = await Promise.all([invoiceRows(db, eq(invoice.id, p.invoiceId)), getProfile(db), readTab(db, 'fees')]);
  if (!inv) notFound();
  const [s] = await db.select().from(student).where(eq(student.id, inv.studentId)).limit(1);
  const [to] = inv.billingContactId ? await db.select().from(contact).where(eq(contact.id, inv.billingContactId)).limit(1)
    : await db.select({ name: contact.name, address: contact.address, postcode: contact.postcode }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId))
      .where(and(eq(studentContact.studentId, inv.studentId), eq(studentContact.isPrimary, true))).limit(1);
  const row = (k: string, v: React.ReactNode) => <tr><th scope="row" style={{ textAlign: 'left', width: '40%' }}>{k}</th><td className="wrap">{v}</td></tr>;
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>Receipt R{p.id}</h1><p>Print it, or save it as a PDF from the print dialog.</p></div>
        <div className="ra-toolbar"><PrintButton /><Link className="ra-btn" href={`/admin/fees/student/${inv.studentId}`}>Back to their fees</Link></div></div>
      <article className="ra-card ra-receipt" aria-label={`Receipt R${p.id}`}>
        <header><h2 style={{ margin: 0 }}>{profile?.name ?? 'School'}</h2>
          <p className="ra-note" style={{ margin: 0 }}>{[profile?.address, profile?.city, profile?.postcode].filter(Boolean).join(', ')}{profile?.tel ? ` · ${profile.tel}` : ''}</p></header>
        <h3 style={{ margin: '12px 0 4px' }}>Receipt R{p.id}</h3>
        {p.status !== 'Cleared' && <p className="ra-banner ra-alert" role="note" style={{ margin: '4px 0' }}>This payment is {p.status.toLowerCase()}, not cleared.</p>}
        <table className="ra-table"><tbody>
          {row('Received from', inv.billingName ?? to?.name ?? '—')}
          {(inv.billingAddress ?? to?.address) && row('Address', [inv.billingAddress ?? to?.address, inv.billingPostcode ?? to?.postcode].filter(Boolean).join(', '))}
          {row('Student', `${s?.firstName ?? ''} ${s?.surname ?? ''} (#${inv.studentId})`)}
          {row('Date received', formatCalendarDate(p.receivedOn))}
          {row('Amount', formatPence(p.amountPence))}
          {row('Method', `${p.method}${p.reference ? ` · ref ${p.reference}` : ''}`)}
          {row('For', `Invoice #${inv.id}: ${inv.description ?? inv.type}${inv.periodFrom ? ` (${formatCalendarDate(inv.periodFrom)} to ${inv.periodTo ? formatCalendarDate(inv.periodTo) : ''})` : ''}`)}
          {row('Invoice balance now', formatPence(Math.max(0, inv.balance)))}
          {fees.feeNotesOnReceipts && (p.note || inv.billingNotes) ? row('Notes', [p.note, inv.billingNotes].filter(Boolean).join(' · ')) : null}
        </tbody></table>
      </article>
    </div>
  );
}
