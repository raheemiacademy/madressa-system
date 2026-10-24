import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { contact, directDebitMandate, INVOICE_TYPES, invoice, PAYMENT_METHODS, PAYMENT_STATUSES, payment, RECEIPT_STATES, student, studentContact } from '@/db/schema';
import { plusDays, plusMonths } from '@/lib/fees';
import { todayIso } from '../people/common';
import { invoiceRows, totals, type InvoiceRow } from './invoices';

type InvoiceType = (typeof INVOICE_TYPES)[number];
const classesOf = sql<string | null>`(select string_agg(c.name, ', ' order by c.name) from class_assignment a join school_class c on c.id = a.class_id
  where a.student_id = "student"."id" and a.to_date is null)`;

/* ───────── Dashboard ───────── */

export async function dashboard(db: DbOrTx, yearId: number) {
  const today = todayIso();
  const rows = await invoiceRows(db, eq(invoice.academicYearId, yearId), today);
  const byType = INVOICE_TYPES.map((type) => ({ type, ...totals(rows.filter((r) => r.type === type)) })).filter((t) => t.due > 0);
  const from = plusMonths(`${today.slice(0, 7)}-01`, -5);
  const [inv, rec] = await Promise.all([
    db.select({ month: sql<string>`to_char(${invoice.invoiceDate}, 'YYYY-MM')`, total: sql<number>`sum(${invoice.amountPence})`.mapWith(Number) }).from(invoice)
      .where(and(isNull(invoice.deletedAt), gte(invoice.invoiceDate, from), lte(invoice.invoiceDate, today))).groupBy(sql`1`),
    db.select({ month: sql<string>`to_char(${payment.receivedOn}, 'YYYY-MM')`, total: sql<number>`sum(${payment.amountPence})`.mapWith(Number) }).from(payment)
      .innerJoin(invoice, eq(invoice.id, payment.invoiceId)).where(and(isNull(invoice.deletedAt), eq(payment.status, 'Cleared'), gte(payment.receivedOn, from), lte(payment.receivedOn, today))).groupBy(sql`1`)
  ]);
  const months = Array.from({ length: 6 }, (_, i) => plusMonths(from, i).slice(0, 7));
  return {
    totals: totals(rows), overdueCount: rows.filter((r) => r.status === 'Overdue').length, byType,
    monthly: months.map((month) => ({ month, invoiced: inv.find((x) => x.month === month)?.total ?? 0, received: rec.find((x) => x.month === month)?.total ?? 0 }))
  };
}

/* ───────── Payments (dashboard list, All Fees Received, Query Fees, bank transfers, receipts) ───────── */

export type PaymentFilter = {
  from?: string; to?: string; id?: number; type?: InvoiceType; status?: (typeof PAYMENT_STATUSES)[number]; method?: (typeof PAYMENT_METHODS)[number];
  reference?: string; receipt?: (typeof RECEIPT_STATES)[number]; q?: string; studentIds?: number[];
  order?: 'recent' | 'oldest' | 'name' | 'low' | 'high'; limit?: number;
};

export async function paymentList(db: DbOrTx, f: PaymentFilter = {}) {
  const conds: (SQL | undefined)[] = [isNull(invoice.deletedAt)];
  if (f.from) conds.push(gte(payment.receivedOn, f.from));
  if (f.to) conds.push(lte(payment.receivedOn, f.to));
  if (f.id) conds.push(eq(payment.id, f.id));
  if (f.type) conds.push(eq(invoice.type, f.type));
  if (f.status) conds.push(eq(payment.status, f.status));
  if (f.method) conds.push(eq(payment.method, f.method));
  if (f.receipt) conds.push(eq(payment.receiptState, f.receipt));
  if (f.studentIds) conds.push(inArray(invoice.studentId, f.studentIds.length ? f.studentIds : [0]));
  if (f.reference) conds.push(sql`lower(coalesce(${payment.reference}, '')) like ${`%${f.reference.toLowerCase()}%`}`);
  if (f.q) {
    const id = /^#?\d{1,9}$/.test(f.q.trim()) ? Number(f.q.trim().replace('#', '')) : null;
    conds.push(id ? eq(payment.id, id) : sql`lower(${student.firstName} || ' ' || ${student.surname}) like ${`%${f.q.trim().toLowerCase()}%`} or lower(${payment.method}::text) like ${`%${f.q.trim().toLowerCase()}%`}`);
  }
  const order = f.order === 'oldest' ? [asc(payment.receivedOn), asc(payment.id)] : f.order === 'name' ? [asc(student.surname), asc(student.firstName), desc(payment.receivedOn)]
    : f.order === 'low' ? [asc(payment.amountPence), desc(payment.id)] : f.order === 'high' ? [desc(payment.amountPence), desc(payment.id)] : [desc(payment.receivedOn), desc(payment.id)];
  return db.select({
    id: payment.id, receivedOn: payment.receivedOn, amountPence: payment.amountPence, method: payment.method, status: payment.status, reference: payment.reference, note: payment.note,
    receiptState: payment.receiptState, invoiceId: invoice.id, invoiceAmount: invoice.amountPence, type: invoice.type, studentId: student.id,
    studentName: sql<string>`${student.firstName} || ' ' || ${student.surname}`, classes: classesOf
  }).from(payment).innerJoin(invoice, eq(invoice.id, payment.invoiceId)).innerJoin(student, eq(student.id, invoice.studentId))
    .where(and(...conds)).orderBy(...order).limit(f.limit ?? 500);
}
export type PaymentRow = Awaited<ReturnType<typeof paymentList>>[number];

/* ───────── Annual, monthly, overview ───────── */

/** Groups invoice rows by a key into Invoices, Total, Received and Balance. */
export function rollUp<K>(rows: InvoiceRow[], key: (r: InvoiceRow) => K) {
  const out = new Map<K, { count: number; total: number; received: number; balance: number }>();
  for (const r of rows) {
    const k = key(r);
    const t = out.get(k) ?? { count: 0, total: 0, received: 0, balance: 0 };
    t.count++; t.total += r.amountPence; t.received += r.received; t.balance += r.balance;
    out.set(k, t);
  }
  return out;
}

/** §2 Annual report rows, by invoice, student or contact (an invoice's billing contact, else the student's primary contact). */
export async function annual(db: DbOrTx, yearId: number, type?: InvoiceType) {
  const rows = await invoiceRows(db, and(eq(invoice.academicYearId, yearId), type ? eq(invoice.type, type) : undefined));
  const ids = [...new Set(rows.map((r) => r.studentId))];
  const primary = ids.length ? await db.select({ s: studentContact.studentId, c: studentContact.contactId, name: contact.name }).from(studentContact)
    .innerJoin(contact, eq(contact.id, studentContact.contactId)).where(and(inArray(studentContact.studentId, ids), eq(studentContact.isPrimary, true))) : [];
  const billing = new Map((await (rows.some((r) => r.billingContactId) ? db.select({ id: contact.id, name: contact.name }).from(contact)
    .where(inArray(contact.id, [...new Set(rows.map((r) => r.billingContactId).filter((x): x is number => !!x))])) : Promise.resolve([]))).map((c) => [c.id, c.name]));
  const contactOf = (r: InvoiceRow) => {
    if (r.billingContactId && billing.has(r.billingContactId)) return `${r.billingContactId}|${billing.get(r.billingContactId)}`;
    const p = primary.find((x) => x.s === r.studentId);
    return p ? `${p.c}|${p.name}` : '0|No contact';
  };
  const students = [...rollUp(rows, (r) => `${r.studentId}|${r.studentName}`)].map(([k, t]) => ({ id: Number(k.split('|')[0]), name: k.split('|').slice(1).join('|'), ...t }));
  const contacts = [...rollUp(rows, contactOf)].map(([k, t]) => ({ id: Number(k.split('|')[0]), name: k.split('|').slice(1).join('|'), ...t }));
  return { invoices: rows, students: students.sort((a, b) => a.name.localeCompare(b.name)), contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)), totals: totals(rows) };
}

/** §2 Monthly Fees: invoices dated in the month, with cleared, pending and outstanding totals. */
export async function monthly(db: DbOrTx, month: string, type?: InvoiceType) {
  const from = `${month}-01`, to = plusDays(plusMonths(from, 1), -1);
  const rows = await invoiceRows(db, and(gte(invoice.invoiceDate, from), lte(invoice.invoiceDate, to), type ? eq(invoice.type, type) : undefined));
  return { rows, totals: totals(rows) };
}

/** §2 Full Overview: every student with invoices this year. */
export async function overview(db: DbOrTx, yearId: number) {
  const rows = await invoiceRows(db, eq(invoice.academicYearId, yearId));
  return [...rollUp(rows, (r) => r.studentId)].map(([id, t]) => ({ id, name: rows.find((r) => r.studentId === id)!.studentName, ...t })).sort((a, b) => a.name.localeCompare(b.name));
}

/* ───────── Direct debits ───────── */

/** §2 Direct Debit Stats: current students with whether any of their contacts has an active GoCardless mandate. */
export async function directDebits(db: DbOrTx, show: 'all' | 'active' | 'inactive') {
  const kids = await db.select({ id: student.id, name: sql<string>`${student.firstName} || ' ' || ${student.surname}`, classes: classesOf }).from(student).where(eq(student.status, 'Current')).orderBy(asc(student.surname), asc(student.firstName));
  const links = kids.length ? await db.select({ s: studentContact.studentId, contactId: contact.id, name: contact.name, status: directDebitMandate.status })
    .from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).innerJoin(directDebitMandate, eq(directDebitMandate.contactId, contact.id))
    .where(inArray(studentContact.studentId, kids.map((k) => k.id))) : [];
  const rows = kids.map((k) => {
    const mine = links.filter((l) => l.s === k.id);
    const active = mine.filter((l) => ACTIVE_MANDATE.has(l.status));
    return { ...k, active: active.length > 0, contacts: [...new Set(active.map((l) => l.name))], other: [...new Set(mine.filter((l) => !ACTIVE_MANDATE.has(l.status)).map((l) => `${l.name} (${l.status.replace(/_/g, ' ')})`))] };
  });
  return rows.filter((r) => show === 'all' || (show === 'active') === r.active);
}
export const ACTIVE_MANDATE = new Set(['pending_customer_approval', 'pending_submission', 'submitted', 'active']);

/* ───────── Reminders ───────── */

export type ReminderFilter = { show: 'overdue' | 'active' | 'upcoming' | 'all'; type?: InvoiceType; min?: number; month?: string; from?: string; to?: string; studentIds?: number[] };

/** §2 Outstanding/Reminders: invoices with a balance. Overdue = past due; Active = due within 7 days or past; Upcoming = due later. */
export async function reminders(db: DbOrTx, f: ReminderFilter) {
  const today = todayIso();
  const conds: (SQL | undefined)[] = [f.type ? eq(invoice.type, f.type) : undefined];
  if (f.month) conds.push(sql`to_char(${invoice.dueDate}, 'YYYY-MM') = ${f.month}`);
  if (f.from) conds.push(gte(invoice.dueDate, f.from));
  if (f.to) conds.push(lte(invoice.dueDate, f.to));
  if (f.studentIds) conds.push(inArray(invoice.studentId, f.studentIds.length ? f.studentIds : [0]));
  const soon = plusDays(today, 7);
  return (await invoiceRows(db, and(...conds), today)).filter((r) => r.balance > 0 && (!f.min || r.balance >= f.min)
    && (f.show === 'all' || (f.show === 'overdue' ? r.dueDate < today : f.show === 'active' ? r.dueDate <= soon : r.dueDate > today)));
}

/* ───────── Diagnose ───────── */

export type Problem = { kind: string; detail: string; invoiceId?: number; studentId?: number };

/** §2 Diagnose Fees/Invoices: consistency checks across invoices and payments. Lists problems; it never changes anything. */
export async function diagnose(db: DbOrTx): Promise<Problem[]> {
  const today = todayIso();
  const out: Problem[] = [];
  const name = sql<string>`s.first_name || ' ' || s.surname`;
  const q = async <T extends Record<string, unknown>>(s: SQL) => [...(await db.execute(s))] as unknown as T[];
  for (const r of await q<{ id: number; invoice_id: number; student_id: number; name: string }>(sql`select p.id, p.invoice_id, i.student_id, ${name} as name from payment p join invoice i on i.id = p.invoice_id join student s on s.id = i.student_id where i.deleted_at is not null`))
    out.push({ kind: 'Payment on a deleted invoice', detail: `Payment #${r.id} is on deleted invoice #${r.invoice_id} (${r.name})`, invoiceId: r.invoice_id, studentId: r.student_id });
  for (const r of await q<{ id: number; student_id: number; name: string; amount: number; got: number }>(sql`select i.id, i.student_id, ${name} as name, i.amount_pence as amount, sum(p.amount_pence)::int as got
    from invoice i join payment p on p.invoice_id = i.id join student s on s.id = i.student_id where i.deleted_at is null and p.status = 'Cleared' group by i.id, s.id having sum(p.amount_pence) > i.amount_pence`))
    out.push({ kind: 'Overpaid invoice', detail: `Invoice #${r.id} (${r.name}) has more received than its amount`, invoiceId: r.id, studentId: r.student_id });
  for (const r of await q<{ id: number; student_id: number; name: string }>(sql`select i.id, i.student_id, ${name} as name from invoice i join student s on s.id = i.student_id where i.deleted_at is null and i.due_date < i.invoice_date`))
    out.push({ kind: 'Due before invoice date', detail: `Invoice #${r.id} (${r.name}) is due before it was issued`, invoiceId: r.id, studentId: r.student_id });
  for (const r of await q<{ id: number; student_id: number; name: string }>(sql`select i.id, i.student_id, ${name} as name from invoice i join student s on s.id = i.student_id where i.deleted_at is null and i.amount_pence = 0 and i.type <> 'Fees'`))
    out.push({ kind: 'Zero amount', detail: `Invoice #${r.id} (${r.name}) is for £0`, invoiceId: r.id, studentId: r.student_id });
  for (const r of await q<{ id: number; student_id: number; name: string; received_on: string }>(sql`select p.id, i.student_id, ${name} as name, p.received_on::text from payment p join invoice i on i.id = p.invoice_id join student s on s.id = i.student_id where p.received_on > ${today}::date`))
    out.push({ kind: 'Payment dated in the future', detail: `Payment #${r.id} (${r.name}) is dated ${r.received_on}`, studentId: r.student_id });
  for (const r of await q<{ ids: number[]; student_id: number; name: string }>(sql`select array_agg(i.id order by i.id) as ids, i.student_id, ${name} as name from invoice i join student s on s.id = i.student_id
    where i.deleted_at is null and i.period_from is not null group by i.student_id, s.id, i.type, i.period_from, i.period_to, i.amount_pence having count(*) > 1`))
    out.push({ kind: 'Possible duplicate', detail: `Invoices ${r.ids.map((x) => `#${x}`).join(', ')} (${r.name}) are the same type, period and amount`, invoiceId: r.ids[0], studentId: r.student_id });
  for (const r of await q<{ id: number; student_id: number; name: string; status: string }>(sql`select i.id, i.student_id, ${name} as name, s.status::text from invoice i join student s on s.id = i.student_id
    where i.deleted_at is null and s.left_date is not null and i.type = 'Fees' and coalesce(i.period_from, i.invoice_date) > s.left_date and not exists (select 1 from payment p where p.invoice_id = i.id)`))
    out.push({ kind: 'Billed after leaving', detail: `Invoice #${r.id} (${r.name}, ${r.status}) is for a period after they left`, invoiceId: r.id, studentId: r.student_id });
  return out;
}

/* ───────── Search ───────── */

/** §2 Fees search: name, surname, date of birth (DD/MM/YYYY), part of the address, or #123 for an invoice. */
export async function feesSearch(db: DbOrTx, raw: string) {
  const q = raw.trim().slice(0, 100);
  if (!q) return { invoice: null, students: [] };
  const inv = /^#\d{1,9}$/.test(q) ? (await invoiceRows(db, eq(invoice.id, Number(q.slice(1)))))[0] ?? null : null;
  if (inv) return { invoice: inv, students: [] };
  const dob = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(q);
  const like = `%${q.toLowerCase()}%`;
  const students = await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, dob: student.dob, status: student.status, postcode: student.postcode })
    .from(student).where(dob ? eq(student.dob, `${dob[3]}-${dob[2]!.padStart(2, '0')}-${dob[1]!.padStart(2, '0')}`)
      : sql`lower(${student.firstName} || ' ' || ${student.surname}) like ${like} or lower(${student.surname}) like ${like} or lower(coalesce(${student.address}, '') || ' ' || coalesce(${student.postcode}, '')) like ${like}`)
    .orderBy(asc(student.surname), asc(student.firstName)).limit(50);
  return { invoice: null, students };
}
