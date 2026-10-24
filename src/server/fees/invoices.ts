import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, INVOICE_TYPES, invoice, PAYMENT_METHODS, PAYMENT_STATUSES, payment, student, studentContact } from '@/db/schema';
import { allocate, invoiceStatus } from '@/lib/fees';
import { formatPence, parsePounds } from '@/lib/money';
import { isoDate, optionalIsoDate, optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';

/** A pounds amount typed in a form → integer pence. */
export const pounds = (msg = 'Enter an amount like 30 or 12.50') => z.string().trim().refine((s) => parsePounds(s) !== null, msg).transform((s) => parsePounds(s)!);
const positivePounds = pounds().refine((p) => p > 0, 'Enter an amount above £0');

/* ───────── Reads ───────── */

const received = sql<number>`coalesce(sum(${payment.amountPence}) filter (where ${payment.status} = 'Cleared'), 0)`.mapWith(Number);
const pending = sql<number>`coalesce(sum(${payment.amountPence}) filter (where ${payment.status} in ('Pending', 'Processing')), 0)`.mapWith(Number);

/** Live invoices with their cleared and pending totals, balance and status. */
export async function invoiceRows(db: DbOrTx, where: SQL | undefined, today = todayIso()) {
  const rows = await db.select({ i: invoice, firstName: student.firstName, surname: student.surname, received, pending })
    .from(invoice).innerJoin(student, eq(student.id, invoice.studentId)).leftJoin(payment, eq(payment.invoiceId, invoice.id))
    .where(and(isNull(invoice.deletedAt), where)).groupBy(invoice.id, student.id).orderBy(asc(invoice.dueDate), asc(invoice.id));
  return rows.map((r) => ({
    ...r.i, studentName: `${r.firstName} ${r.surname}`, received: r.received, pending: r.pending,
    balance: r.i.amountPence - r.received, status: invoiceStatus(r.i.amountPence, r.received, r.i.dueDate, today)
  }));
}
export type InvoiceRow = Awaited<ReturnType<typeof invoiceRows>>[number];

/** Total due, received and overdue for a set of invoice rows (§2 per-student totals). */
export function totals(rows: InvoiceRow[]) {
  return {
    due: rows.reduce((s, r) => s + r.amountPence, 0),
    received: rows.reduce((s, r) => s + r.received, 0),
    pending: rows.reduce((s, r) => s + r.pending, 0),
    outstanding: rows.reduce((s, r) => s + Math.max(0, r.balance), 0),
    overdue: rows.filter((r) => r.status === 'Overdue').reduce((s, r) => s + r.balance, 0)
  };
}

export const paymentsFor = (db: DbOrTx, invoiceIds: number[]) => invoiceIds.length
  ? db.select().from(payment).where(inArray(payment.invoiceId, invoiceIds)).orderBy(asc(payment.receivedOn), asc(payment.id))
  : Promise.resolve([]);

/* ───────── Invoices ───────── */

export const invoiceInput = z.object({
  type: z.enum(INVOICE_TYPES),
  studentId: z.coerce.number().int().positive('Choose a student'),
  academicYearId: z.coerce.number().int().positive('Choose an academic year'),
  invoiceDate: isoDate,
  dueDate: isoDate,
  periodFrom: optionalIsoDate, periodTo: optionalIsoDate,
  amount: pounds(),
  description: optionalText(300),
  billingContactId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  billingName: optionalText(120), billingAddress: optionalText(300), billingPostcode: optionalText(12), billingNotes: optionalText(500)
}).refine((v) => !v.periodFrom || !v.periodTo || v.periodTo >= v.periodFrom, { path: ['periodTo'], message: 'The period can’t end before it starts' })
  .refine((v) => v.dueDate >= v.invoiceDate, { path: ['dueDate'], message: 'The due date can’t be before the invoice date' });

type Result = { ok: true; id: number } | { ok: false; errors: Record<string, string> };

/** Add or modify an invoice (§2 add-invoice). Generated invoices keep their generation key, so they're never regenerated. */
export async function saveInvoice(db: Db, actor: Actor, raw: unknown, id?: number): Promise<Result> {
  const p = invoiceInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const { amount, ...v } = p.data;
  return db.transaction(async (tx): Promise<Result> => {
    const [s] = await tx.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).where(eq(student.id, v.studentId)).limit(1);
    if (!s) return { ok: false, errors: { studentId: 'Choose a student' } };
    const [y] = await tx.select({ id: academicYear.id }).from(academicYear).where(eq(academicYear.id, v.academicYearId)).limit(1);
    if (!y) return { ok: false, errors: { academicYearId: 'Choose an academic year' } };
    if (v.billingContactId) {
      const [link] = await tx.select().from(studentContact).where(and(eq(studentContact.studentId, v.studentId), eq(studentContact.contactId, v.billingContactId))).limit(1);
      if (!link) return { ok: false, errors: { billingContactId: 'Choose one of this student’s contacts' } };
    }
    if (id) {
      const [cur] = await invoiceRows(tx, eq(invoice.id, id));
      if (!cur) return { ok: false, errors: { amount: 'This invoice no longer exists' } };
      if (cur.studentId !== v.studentId && (cur.received || cur.pending)) return { ok: false, errors: { studentId: 'Move or delete its payments before changing the student' } };
      if (amount < cur.received) return { ok: false, errors: { amount: `${formatPence(cur.received)} has already been received against this invoice` } };
      await tx.update(invoice).set({ ...v, amountPence: amount, updatedAt: new Date() }).where(eq(invoice.id, id));
      await audit(tx, actor, { action: `Modified invoice #${id} for ${s.firstName} ${s.surname} (${formatPence(amount)})`, page: 'Fees', entity: 'invoice', entityId: id });
      return { ok: true, id };
    }
    const [row] = await tx.insert(invoice).values({ ...v, amountPence: amount, createdBy: actor.identityId }).returning({ id: invoice.id });
    await audit(tx, actor, { action: `Created ${v.type} invoice #${row!.id} for ${s.firstName} ${s.surname} (${formatPence(amount)})`, page: 'Fees', entity: 'invoice', entityId: row!.id });
    return { ok: true, id: row!.id };
  });
}

/** Deletes one invoice that has no payments (it's kept as deleted, so generation won't recreate it). */
export async function deleteInvoice(db: Db, actor: Actor, id: number): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const [cur] = await invoiceRows(tx, eq(invoice.id, id));
    if (!cur) return { ok: false, error: 'This invoice no longer exists' };
    const [paid] = await tx.select({ id: payment.id }).from(payment).where(eq(payment.invoiceId, id)).limit(1);
    if (paid) return { ok: false, error: 'Delete or move its payments first' };
    await tx.update(invoice).set({ deletedAt: new Date() }).where(eq(invoice.id, id));
    await audit(tx, actor, { action: `Deleted invoice #${id} for ${cur.studentName} (${formatPence(cur.amountPence)})`, page: 'Fees', entity: 'invoice', entityId: id });
    return { ok: true };
  });
}

/* ───────── Payments ───────── */

export const paymentInput = z.object({
  invoiceId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  // "Oldest unpaid first": the payment is split across these students' invoices by due date.
  studentIds: z.array(z.coerce.number().int().positive()).max(20).default([]),
  amount: positivePounds,
  receivedOn: isoDate,
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES).default('Cleared'),
  reference: optionalText(80),
  note: optionalText(300)
}).refine((v) => v.invoiceId || v.studentIds.length, { path: ['invoiceId'], message: 'Choose an invoice' })
  .refine((v) => v.receivedOn <= todayIso(), { path: ['receivedOn'], message: 'The date received can’t be in the future' });

/** §2 Add Fees: a payment against one invoice, or split oldest-first across a student's (or family's) unpaid invoices. */
type PaymentResult = { ok: true; ids: number[] } | { ok: false; errors: Record<string, string> };
export async function recordPayment(db: Db, actor: Actor, raw: unknown): Promise<PaymentResult> {
  const p = paymentInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const { invoiceId, studentIds, amount, ...v } = p.data;
  return db.transaction(async (tx): Promise<PaymentResult> => {
    const open = await invoiceRows(tx, invoiceId ? eq(invoice.id, invoiceId) : inArray(invoice.studentId, studentIds));
    if (invoiceId && !open.length) return { ok: false, errors: { invoiceId: 'This invoice no longer exists' } };
    // Pending money counts as spoken for, so the same invoice isn't paid twice while a payment clears.
    const { parts, left } = allocate(amount, open.map((i) => ({ id: i.id, balance: i.amountPence - i.received - i.pending })));
    const owed = amount - left;
    if (left > 0) return { ok: false, errors: { amount: owed ? `That’s ${formatPence(left)} more than is owed (${formatPence(owed)})` : 'Nothing is owed on this invoice' } };
    const group = parts.length > 1 ? randomUUID() : null;
    const rows = await tx.insert(payment).values(parts.map((x) => ({ ...v, invoiceId: x.invoiceId, amountPence: x.amount, checkoutGroup: group, createdBy: actor.identityId }))).returning({ id: payment.id });
    const names = [...new Set(open.filter((i) => parts.some((x) => x.invoiceId === i.id)).map((i) => i.studentName))].join(', ');
    await audit(tx, actor, { action: `Recorded ${formatPence(amount)} ${v.method} (${v.status}) for ${names}${parts.length > 1 ? ` across ${parts.length} invoices` : ` on invoice #${parts[0]!.invoiceId}`}`, page: 'Add fees', entity: 'payment', details: { ids: rows.map((r) => r.id) } });
    return { ok: true, ids: rows.map((r) => r.id) };
  });
}

/** §2 "Process" selected payments: mark Cleared (Complete/Received) or Pending, set any status (bank transfers), or delete. */
export async function processPayments(db: Db, actor: Actor, ids: number[], action: (typeof PAYMENT_STATUSES)[number] | 'delete', page = 'Student fees') {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const rows = action === 'delete'
      ? await tx.delete(payment).where(inArray(payment.id, ids)).returning({ id: payment.id, amount: payment.amountPence })
      : await tx.update(payment).set({ status: action, updatedAt: new Date() }).where(inArray(payment.id, ids)).returning({ id: payment.id, amount: payment.amountPence });
    if (rows.length) await audit(tx, actor, { action: `${action === 'delete' ? 'Deleted' : `Set ${action} on`} ${rows.length === 1 ? '1 payment' : `${rows.length} payments`} (${formatPence(rows.reduce((s, r) => s + r.amount, 0))})`, page, entity: 'payment', details: { ids: rows.map((r) => r.id) } });
    return rows.length;
  });
}

/** §2 "Move Here": moves a payment to another live invoice of the same student. */
export async function movePayment(db: Db, actor: Actor, paymentId: number, invoiceId: number): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const [pay] = await tx.select({ p: payment, studentId: invoice.studentId }).from(payment).innerJoin(invoice, eq(invoice.id, payment.invoiceId)).where(eq(payment.id, paymentId)).limit(1);
    const [to] = await tx.select().from(invoice).where(and(eq(invoice.id, invoiceId), isNull(invoice.deletedAt))).limit(1);
    if (!pay || !to) return { ok: false, error: 'That payment or invoice no longer exists' };
    if (to.studentId !== pay.studentId) return { ok: false, error: 'Payments can only move between the same student’s invoices' };
    if (to.id === pay.p.invoiceId) return { ok: true };
    await tx.update(payment).set({ invoiceId, updatedAt: new Date() }).where(eq(payment.id, paymentId));
    await audit(tx, actor, { action: `Moved payment #${paymentId} (${formatPence(pay.p.amountPence)}) from invoice #${pay.p.invoiceId} to #${invoiceId}`, page: 'Student fees', entity: 'payment', entityId: paymentId });
    return { ok: true };
  });
}

/* ───────── Bulk delete (typed school name checked by the caller) ───────── */

export const bulkDeleteInput = z.object({
  from: isoDate, to: isoDate,
  includePayments: z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on'),
  studentIds: z.string().trim().max(5000).optional().transform((s) => (s ?? '').split(/[\s,]+/).filter(Boolean).map(Number))
    .refine((ids) => ids.every((n) => Number.isInteger(n) && n > 0), 'Use student IDs separated by commas')
}).refine((v) => v.to >= v.from, { path: ['to'], message: 'The end date can’t be before the start' });

/** §2 bulk delete: invoices dated in the range (optionally only some students), and their payments if asked. */
export async function bulkDelete(db: Db, actor: Actor, raw: unknown): Promise<{ ok: true; invoices: number; payments: number } | { ok: false; errors: Record<string, string> }> {
  const p = bulkDeleteInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const where = and(isNull(invoice.deletedAt), gte(invoice.invoiceDate, v.from), lte(invoice.invoiceDate, v.to), v.studentIds.length ? inArray(invoice.studentId, v.studentIds) : undefined);
    const ids = (await tx.select({ id: invoice.id }).from(invoice).where(where)).map((r) => r.id);
    const pays = ids.length ? await tx.select({ id: payment.id }).from(payment).where(inArray(payment.invoiceId, ids)) : [];
    if (pays.length && !v.includePayments) return { ok: false as const, errors: { includePayments: `${pays.length === 1 ? '1 payment is' : `${pays.length} payments are`} recorded against these invoices. Tick “Also delete payments” or narrow the range.` } };
    if (pays.length) await tx.delete(payment).where(inArray(payment.id, pays.map((x) => x.id)));
    if (ids.length) await tx.update(invoice).set({ deletedAt: new Date() }).where(inArray(invoice.id, ids));
    await audit(tx, actor, { action: `Bulk deleted ${ids.length === 1 ? '1 invoice' : `${ids.length} invoices`} and ${pays.length === 1 ? '1 payment' : `${pays.length} payments`} (${v.from} to ${v.to})`, page: 'Delete invoices', entity: 'invoice', details: { studentIds: v.studentIds, invoiceIds: ids } });
    return { ok: true as const, invoices: ids.length, payments: pays.length };
  });
}

/** "When marking someone left": deletes their invoices with no payments whose period (or invoice date) starts after the left date. */
export async function dropUnpaidAfter(db: DbOrTx, studentIds: number[], after: string) {
  const rows = await db.execute(sql`update invoice i set deleted_at = now() where i.student_id in (${sql.join(studentIds.map((n) => sql`${n}`), sql`, `)})
    and i.deleted_at is null and coalesce(i.period_from, i.invoice_date) > ${after}::date and not exists (select 1 from payment p where p.invoice_id = i.id) returning i.id`);
  return rows.length;
}
