import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { INVOICE_TYPES, invoice, PAYMENT_METHODS, PAYMENT_STATUSES, payment, student } from '@/db/schema';
import { formatPence, parsePounds } from '@/lib/money';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';
import { csvDate } from '../people/csv';
import type { RowResult } from '../people/imports';

/** §2 Import Fees columns. A row with invoice_id updates that invoice; payment_* columns record a payment against it. */
export const FEE_COLUMNS: { name: string; required?: boolean; help: string }[] = [
  { name: 'invoice_id', help: 'Leave blank to create a new invoice; keep it to update that invoice or add a payment to it' },
  { name: 'student_id', required: true, help: 'Use the student ID checker on this page if unsure' },
  { name: 'student_name', help: 'For your reference only; not imported' },
  { name: 'type', help: `${INVOICE_TYPES.join(', ')}. Blank means Fees` },
  { name: 'invoice_date', help: 'Required for new invoices. DD/MM/YYYY or YYYY-MM-DD' },
  { name: 'due_date', help: 'Required for new invoices' },
  { name: 'period_from', help: 'Optional' }, { name: 'period_to', help: 'Optional' },
  { name: 'amount', help: 'Invoice amount in pounds, e.g. 30 or 12.50. Required for new invoices' },
  { name: 'description', help: 'Optional' },
  { name: 'payment_amount', help: 'Optional: records a payment of this amount on the invoice' },
  { name: 'payment_date', help: 'Date received (required with a payment)' },
  { name: 'payment_method', help: `${PAYMENT_METHODS.join(', ')}. Blank means Cash` },
  { name: 'payment_status', help: `${PAYMENT_STATUSES.join(', ')}. Blank means Cleared` },
  { name: 'payment_reference', help: 'Optional, e.g. a bank reference' }
];

const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T) => {
  const s = (v ?? '').trim();
  if (!s) return fallback;
  return allowed.find((a) => a.toLowerCase() === s.toLowerCase()) ?? null;
};

/** Validates every row without writing. The same check runs again on confirm. */
export async function checkFeeRows(db: DbOrTx, rows: Record<string, string>[], yearId: number | null): Promise<RowResult[]> {
  const sids = [...new Set(rows.map((r) => Number(r.student_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const iids = [...new Set(rows.map((r) => Number(r.invoice_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const students = new Map((sids.length ? await db.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).where(inArray(student.id, sids)) : []).map((s) => [s.id, `${s.firstName} ${s.surname}`]));
  const invoices = new Map((iids.length ? await db.select({ id: invoice.id, studentId: invoice.studentId }).from(invoice).where(and(inArray(invoice.id, iids), isNull(invoice.deletedAt))) : []).map((i) => [i.id, i]));
  const today = todayIso();
  return rows.map((r, i) => {
    const errors: string[] = [];
    const line = i + 2;
    const sid = Number(r.student_id);
    if (!students.has(sid)) errors.push(r.student_id?.trim() ? `No student has ID ${r.student_id}` : 'student_id is required');
    const iid = r.invoice_id?.trim() ? Number(r.invoice_id) : null;
    const inv = iid ? invoices.get(iid) : null;
    if (iid && !inv) errors.push(`No invoice has ID ${r.invoice_id}`);
    if (inv && inv.studentId !== sid) errors.push(`Invoice ${iid} belongs to another student`);
    if (!iid && !yearId) errors.push('Choose an academic year first');
    const type = pick(r.type, INVOICE_TYPES, 'Fees');
    if (!type) errors.push(`Unknown type “${r.type}”`);
    const d = Object.fromEntries((['invoice_date', 'due_date', 'period_from', 'period_to', 'payment_date'] as const).map((k) => {
      const v = csvDate(r[k]);
      if (v === null) errors.push(`${k} isn’t a date`);
      return [k, v || null];
    })) as Record<'invoice_date' | 'due_date' | 'period_from' | 'period_to' | 'payment_date', string | null>;
    const amount = r.amount?.trim() ? parsePounds(r.amount) : null;
    if (r.amount?.trim() && amount === null) errors.push('amount isn’t an amount');
    if (!iid) {
      if (!d.invoice_date) errors.push('invoice_date is required for a new invoice');
      if (!d.due_date) errors.push('due_date is required for a new invoice');
      if (amount === null) errors.push('amount is required for a new invoice');
    }
    if (d.invoice_date && d.due_date && d.due_date < d.invoice_date) errors.push('due_date is before invoice_date');
    if (d.period_from && d.period_to && d.period_to < d.period_from) errors.push('period_to is before period_from');
    const pay = r.payment_amount?.trim() ? parsePounds(r.payment_amount) : null;
    if (r.payment_amount?.trim() && !pay) errors.push('payment_amount isn’t an amount above £0');
    const method = pick(r.payment_method, PAYMENT_METHODS, 'Cash');
    const status = pick(r.payment_status, PAYMENT_STATUSES, 'Cleared');
    if (pay) {
      if (!d.payment_date) errors.push('payment_date is required with a payment');
      else if (d.payment_date > today) errors.push('payment_date is in the future');
      if (!method) errors.push(`Unknown payment_method “${r.payment_method}”`);
      if (!status) errors.push(`Unknown payment_status “${r.payment_status}”`);
    }
    const name = students.get(sid) ?? '';
    const summary = `${iid ? `Update #${iid}` : 'New invoice'} · ${name}${amount !== null ? ` · ${formatPence(amount)}` : ''}${pay ? ` · payment ${formatPence(pay)}` : ''}`;
    return { line, ok: !errors.length, errors, summary, data: { iid, sid, type, ...d, amount, description: r.description?.trim() || null, pay, method, status, reference: r.payment_reference?.trim().slice(0, 80) || null } };
  });
}

export async function commitFeeRows(db: Db, actor: Actor, results: RowResult[], yearId: number | null) {
  return db.transaction(async (tx) => {
    let added = 0, updated = 0, payments = 0;
    for (const r of results.filter((x) => x.ok)) {
      const v = r.data as { iid: number | null; sid: number; type: (typeof INVOICE_TYPES)[number]; invoice_date: string | null; due_date: string | null; period_from: string | null; period_to: string | null; amount: number | null; description: string | null; pay: number | null; method: (typeof PAYMENT_METHODS)[number]; status: (typeof PAYMENT_STATUSES)[number]; payment_date: string | null; reference: string | null };
      let id = v.iid;
      if (id) {
        const set = Object.fromEntries(Object.entries({ type: v.type, invoiceDate: v.invoice_date, dueDate: v.due_date, periodFrom: v.period_from, periodTo: v.period_to, amountPence: v.amount, description: v.description }).filter(([, x]) => x !== null));
        if (Object.keys(set).length) { await tx.update(invoice).set({ ...set, updatedAt: new Date() }).where(eq(invoice.id, id)); updated++; }
      } else {
        id = (await tx.insert(invoice).values({ type: v.type, studentId: v.sid, academicYearId: yearId!, invoiceDate: v.invoice_date!, dueDate: v.due_date!, periodFrom: v.period_from, periodTo: v.period_to, amountPence: v.amount!, description: v.description, createdBy: actor.identityId }).returning({ id: invoice.id }))[0]!.id;
        added++;
      }
      if (v.pay) { await tx.insert(payment).values({ invoiceId: id, amountPence: v.pay, receivedOn: v.payment_date!, method: v.method, status: v.status, reference: v.reference, createdBy: actor.identityId }); payments++; }
    }
    await audit(tx, actor, { action: `Imported fees: ${added} invoices added, ${updated} updated, ${payments} payments recorded`, page: 'Import fees', entity: 'invoice' });
    return { added, updated, skipped: results.length - results.filter((x) => x.ok).length, payments };
  });
}
