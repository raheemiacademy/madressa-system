import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { directDebitMandate, invoice, payment, studentContact } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { audit } from '../audit';
import { cardGateway, directDebitGateway } from '../fees/clients';
import { invoiceRows } from '../fees/invoices';
import { appUrl } from '../password-links';
import { todayIso } from '../people/common';
import { readTab } from '../settings';
import type { ParentCtx } from './access';

/* §2/§20 Fees in the parent portal: the family's invoices, bank transfer details, card payments (Stripe) and direct debit (GoCardless). */

type PortalActor = { identityId: number; name: string };

/** Invoices for all of this parent's children, newest due first, and what's still to pay. */
export async function familyFees(db: DbOrTx, ctx: ParentCtx, today = todayIso()) {
  const ids = ctx.kids.map((k) => k.id);
  const rows = ids.length ? await invoiceRows(db, inArray(invoice.studentId, ids), today) : [];
  const unpaid = rows.filter((r) => r.balance > 0);
  return {
    invoices: [...rows].sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.id - a.id),
    outstanding: unpaid.reduce((s, r) => s + r.balance, 0),
    overdue: unpaid.filter((r) => r.status === 'Overdue').reduce((s, r) => s + r.balance, 0),
    nextDue: unpaid.filter((r) => r.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
    unpaid
  };
}

/** The school's bank details and this family's reference, built from the Fees settings template. */
export async function bankTransfer(db: DbOrTx, ctx: ParentCtx, unpaidCount: number, now = new Date()) {
  const f = await readTab(db, 'fees');
  if (!f.bankAccountName && !f.bankAccountNumber) return null;
  const [y, m, d] = todayIso(now).split('-') as [string, string, string];
  const vars: Record<string, string> = {
    CONTACT_ID: String(ctx.contact.id), DATE_YMD: `${y}${m}${d}`, DATE_DMY: `${d}${m}${y}`, DATE_MDY: `${m}${d}${y}`, D: d, M: m, Y: y,
    STUDENT_IDS: ctx.kids.map((k) => k.id).join('-'), NUMBER_OF_INVOICES: String(unpaidCount)
  };
  const reference = String(f.bankReference || '').replace(/\{([A-Z_]+)\}/g, (all, k: string) => vars[k] ?? all).slice(0, 60);
  return { name: f.bankAccountName as string, sortCode: f.bankSortCode as string, number: f.bankAccountNumber as string, iban: f.bankIban as string, reference };
}

/** This parent's most recent direct-debit mandate. */
export const mandateOf = async (db: DbOrTx, contactId: number) =>
  (await db.select().from(directDebitMandate).where(eq(directDebitMandate.contactId, contactId)).orderBy(desc(directDebitMandate.updatedAt)).limit(1))[0] ?? null;

export const MANDATE_LIVE = ['pending_submission', 'submitted', 'active'];

/** What the family can do online, given the school's settings and keys. */
export async function payOptions(db: DbOrTx, ctx: ParentCtx) {
  const [card, dd, mandate, g] = await Promise.all([cardGateway(db), directDebitGateway(db), mandateOf(db, ctx.contact.id), readTab(db, 'gateways')]);
  return { card: !!card, directDebit: !!dd, mandate, mustSetUpDirectDebit: !!dd && !!(g.forceDirectDebit || ctx.tab.forceDirectDebit) && !(mandate && MANDATE_LIVE.includes(mandate.status)) };
}

/**
 * Starts a Stripe Checkout for every unpaid invoice of the family (or the ones chosen). Each invoice gets a Pending payment for its balance,
 * tied to the checkout; the Stripe webhook clears it (never the browser redirect). An abandoned checkout expires and its payments fail.
 */
export async function startCardPayment(db: Db, actor: PortalActor, ctx: ParentCtx, invoiceIds?: number[]) {
  const gw = await cardGateway(db);
  if (!gw) return { ok: false as const, error: 'Card payments aren’t available' };
  const { unpaid } = await familyFees(db, ctx);
  const chosen = unpaid.filter((r) => !invoiceIds?.length || invoiceIds.includes(r.id)).filter((r) => r.balance - r.pending > 0);
  if (!chosen.length) return { ok: false as const, error: 'There’s nothing to pay' };
  const base = appUrl();
  const s = await gw.checkout({
    lines: chosen.map((r) => ({ name: `${r.type} · ${r.studentName}${r.description ? ` · ${r.description}` : ''}`.slice(0, 120), amountPence: r.balance - r.pending })),
    email: ctx.contact.email, successUrl: `${base}/parent/fees?paid=1`, cancelUrl: `${base}/parent/fees`, metadata: { contactId: String(ctx.contact.id) }
  });
  const group = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(payment).values(chosen.map((r) => ({ invoiceId: r.id, amountPence: r.balance - r.pending, receivedOn: todayIso(), method: 'Online' as const, status: 'Pending' as const,
      gatewayProvider: 'stripe', gatewayPaymentId: s.id, checkoutGroup: group, note: 'Card payment from the parent portal', createdBy: actor.identityId })));
    await audit(tx, actor, { action: `Started a card payment of ${formatPence(chosen.reduce((t, r) => t + r.balance - r.pending, 0))}`, page: 'Parent portal', entity: 'payment', details: { invoices: chosen.map((r) => r.id) } });
  });
  return { ok: true as const, url: s.url };
}

/** Sends the parent to GoCardless to set up a direct debit. */
export async function startDirectDebit(db: Db, actor: PortalActor, ctx: ParentCtx) {
  const gw = await directDebitGateway(db);
  if (!gw) return { ok: false as const, error: 'Direct debit isn’t available' };
  const base = appUrl();
  const br = await gw.startMandate({ email: ctx.contact.email, name: ctx.contact.name, redirectUrl: `${base}/parent/fees/direct-debit/done`, exitUrl: `${base}/parent/fees`, metadata: { contactId: String(ctx.contact.id) } });
  await audit(db, actor, { action: 'Started setting up a direct debit', page: 'Parent portal', entity: 'contact', entityId: ctx.contact.id });
  return { ok: true as const, url: br.url };
}

/** Back from GoCardless: links the new mandate to this parent. Its status then follows the GoCardless webhooks. */
export async function finishDirectDebit(db: Db, actor: PortalActor, ctx: ParentCtx, billingRequestId: string) {
  const gw = await directDebitGateway(db);
  if (!gw || !/^BRQ[0-9A-Za-z_]{1,40}$/.test(billingRequestId)) return { ok: false as const, error: 'Direct debit isn’t available' };
  const mandateId = await gw.mandateFrom(billingRequestId);
  if (!mandateId) return { ok: false as const, error: 'The direct debit wasn’t set up. Please try again.' };
  await db.insert(directDebitMandate).values({ contactId: ctx.contact.id, provider: 'gocardless', mandateId, status: 'pending_submission' })
    .onConflictDoUpdate({ target: [directDebitMandate.provider, directDebitMandate.mandateId], set: { contactId: ctx.contact.id, updatedAt: new Date() } });
  await audit(db, actor, { action: 'Set up a direct debit', page: 'Parent portal', entity: 'contact', entityId: ctx.contact.id });
  return { ok: true as const };
}

/**
 * Collects unpaid invoices by direct debit for every family with a working mandate: from the portal ("Pay by direct debit")
 * for one family, or each morning for invoices due by today. An invoice already being paid (pending) isn't collected twice.
 */
export async function collectDirectDebits(db: Db, actor: { identityId: number | null; name: string }, opts: { contactId?: number; dueBy?: string } = {}) {
  const gw = await directDebitGateway(db);
  if (!gw) return 0;
  const mandates = await db.select().from(directDebitMandate).where(and(isNotNull(directDebitMandate.contactId), inArray(directDebitMandate.status, MANDATE_LIVE), opts.contactId ? eq(directDebitMandate.contactId, opts.contactId) : undefined));
  let n = 0;
  for (const m of mandates) {
    const kids = (await db.select({ id: studentContact.studentId }).from(studentContact).where(eq(studentContact.contactId, m.contactId!))).map((k) => k.id);
    if (!kids.length) continue;
    const rows = (await invoiceRows(db, and(inArray(invoice.studentId, kids), opts.dueBy ? lte(invoice.dueDate, opts.dueBy) : undefined))).filter((r) => r.balance - r.pending > 0);
    for (const r of rows) {
      const amount = r.balance - r.pending;
      const p = await gw.collect({ mandateId: m.mandateId, amountPence: amount, description: `${r.type} · ${r.studentName}`.slice(0, 100), metadata: { invoiceId: String(r.id) }, key: `inv${r.id}-${amount}-${formatInstant(new Date(), 'yyyyMMdd')}` });
      await db.insert(payment).values({ invoiceId: r.id, amountPence: amount, receivedOn: todayIso(), method: 'Direct Debit', status: 'Pending', gatewayProvider: 'gocardless', gatewayPaymentId: p.id, note: 'Collected by direct debit', createdBy: actor.identityId });
      n++;
    }
  }
  if (n) await audit(db, actor, { action: `Requested ${n === 1 ? '1 direct-debit payment' : `${n} direct-debit payments`}`, page: 'Fees', entity: 'payment' });
  return n;
}

