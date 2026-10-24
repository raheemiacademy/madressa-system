import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { INVOICE_TYPES, invoice, payment } from '@/db/schema';
import { formatPence, parsePounds } from '@/lib/money';
import { optionalIsoDate, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from '../people/common';
import { invoiceRows } from './invoices';

const optPounds = z.string().trim().optional().refine((s) => !s || parsePounds(s) !== null, 'Enter an amount like 30 or 12.50').transform((s) => (s ? parsePounds(s)! : null));

export const modifyInput = z.object({
  yearId: z.coerce.number().int().positive(),
  type: z.union([z.literal(''), z.enum(INVOICE_TYPES)]).optional().transform((v) => v || null),
  whereAmount: optPounds, whereDue: optionalIsoDate, wherePeriodFrom: optionalIsoDate, wherePeriodTo: optionalIsoDate,
  setAmount: optPounds, setDue: optionalIsoDate, setPeriodFrom: optionalIsoDate, setPeriodTo: optionalIsoDate
}).refine((v) => v.whereAmount !== null || v.whereDue || v.wherePeriodFrom || v.wherePeriodTo, { path: ['whereAmount'], message: 'Choose at least one “where” value' })
  .refine((v) => v.setAmount !== null || v.setDue || v.setPeriodFrom || v.setPeriodTo, { path: ['setAmount'], message: 'Choose at least one new value' });

/** §2 Modify Invoices: the invoices a change would touch, and what each would become. Nothing is written. */
export async function previewModify(db: DbOrTx, raw: unknown) {
  const p = modifyInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  const rows = await invoiceRows(db, and(eq(invoice.academicYearId, v.yearId), v.type ? eq(invoice.type, v.type) : undefined,
    v.whereAmount !== null ? eq(invoice.amountPence, v.whereAmount) : undefined, v.whereDue ? eq(invoice.dueDate, v.whereDue) : undefined,
    v.wherePeriodFrom ? eq(invoice.periodFrom, v.wherePeriodFrom) : undefined, v.wherePeriodTo ? eq(invoice.periodTo, v.wherePeriodTo) : undefined));
  const changes = rows.map((r) => {
    const next = { amountPence: v.setAmount ?? r.amountPence, dueDate: v.setDue ?? r.dueDate, periodFrom: v.setPeriodFrom ?? r.periodFrom, periodTo: v.setPeriodTo ?? r.periodTo };
    const problem = next.amountPence < r.received ? `${formatPence(r.received)} already received`
      : next.dueDate < r.invoiceDate ? 'Due before the invoice date'
        : next.periodFrom && next.periodTo && next.periodTo < next.periodFrom ? 'Period ends before it starts' : null;
    return { row: r, next, problem };
  });
  return { ok: true as const, values: v, changes };
}

/** Applies the previewed change in one transaction, skipping rows with a problem. Audited with every invoice ID. */
export async function applyModify(db: Db, actor: Actor, raw: unknown) {
  return db.transaction(async (tx) => {
    const pv = await previewModify(tx, raw);
    if (!pv.ok) return pv;
    const good = pv.changes.filter((c) => !c.problem);
    for (const c of good) await tx.update(invoice).set({ ...c.next, updatedAt: new Date() }).where(eq(invoice.id, c.row.id));
    await audit(tx, actor, { action: `Modified ${good.length === 1 ? '1 invoice' : `${good.length} invoices`}${pv.changes.length > good.length ? ` (${pv.changes.length - good.length} skipped)` : ''}`, page: 'Modify invoices', entity: 'invoice', details: { ids: good.map((c) => c.row.id), set: pv.values } });
    return { ok: true as const, n: good.length, skipped: pv.changes.length - good.length };
  });
}

/** §2 Send Receipts: mark payments sent manually, flag "no email", or move them back to unsent. Emailing arrives with the mail queue. */
export async function setReceiptState(db: Db, actor: Actor, ids: number[], state: 'manual' | 'no_email' | 'unsent') {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const rows = await tx.update(payment).set({ receiptState: state, receiptSentAt: state === 'manual' ? new Date() : null }).where(inArray(payment.id, ids)).returning({ id: payment.id });
    if (rows.length) await audit(tx, actor, { action: `${state === 'manual' ? 'Marked receipts as sent manually' : state === 'no_email' ? 'Flagged receipts as no email' : 'Moved receipts back to unsent'} (${rows.length})`, page: 'Send receipts', entity: 'payment', details: { ids: rows.map((r) => r.id) } });
    return rows.length;
  });
}
