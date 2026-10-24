import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, contact, invoice, product, productSale, schoolClass, student, studentContact } from '@/db/schema';
import { formatPence, parsePounds } from '@/lib/money';
import { isoDate, optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { classStudentsOn } from '../attendance/registers';
import type { Actor } from '../people/common';
import { studentTotals } from './merits';

const checkbox = z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on');
const pence = z.string().trim().refine((s) => parsePounds(s) !== null, 'Enter an amount like 3 or 2.50').transform((s) => parsePounds(s)!);
const optPence = z.string().trim().optional().refine((s) => !s || parsePounds(s) !== null, 'Enter an amount like 3 or 2.50').transform((s) => (s ? parsePounds(s)! : null));
const optInt = z.union([z.literal(''), z.coerce.number().int().min(0)]).optional().transform((v) => (v === '' || v === undefined ? null : v));

export const productInput = z.object({
  name: z.string().trim().min(1, 'Name the product').max(120), description: optionalText(1000),
  price: pence, originalPrice: optPence,
  meritPrice: optInt.refine((v) => v === null || v > 0, 'Use a number above 0, or leave it blank'), stock: optInt, active: checkbox
});

/** §17 inventory with how many of each have been sold. */
export const listProducts = (db: DbOrTx) => db.select({ p: product, sold: sql<number>`coalesce((select sum(s.qty) from product_sale s where s.product_id = "product"."id"), 0)`.mapWith(Number) })
  .from(product).orderBy(desc(product.active), asc(product.name));

export async function saveProduct(db: Db, actor: Actor, raw: unknown, imageFileId: string | undefined, id?: number) {
  const p = productInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const { price, originalPrice, ...v } = p.data;
  const values = { ...v, pricePence: price, originalPricePence: originalPrice, ...(imageFileId !== undefined ? { imageFileId } : {}) };
  const [row] = id ? await db.update(product).set(values).where(eq(product.id, id)).returning() : await db.insert(product).values(values).returning();
  await audit(db, actor, { action: `Saved product “${v.name}” (${formatPence(price)})`, page: 'Products', entity: 'product', entityId: row?.id });
  return { ok: true as const };
}

export const saleInput = z.object({
  productId: z.coerce.number().int().positive('Choose a product'),
  target: z.enum(['student', 'contact', 'class']),
  studentId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  contactId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  classId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  qty: z.coerce.number().int().min(1, 'At least 1').max(100),
  pay: z.enum(['invoice', 'merits']),
  soldOn: isoDate
}).refine((v) => v.target !== 'student' || v.studentId, { path: ['studentId'], message: 'Choose the student' })
  .refine((v) => v.target !== 'contact' || v.contactId, { path: ['contactId'], message: 'Choose the contact' })
  .refine((v) => v.target !== 'class' || v.classId, { path: ['classId'], message: 'Choose the class' })
  .refine((v) => v.pay === 'invoice' || v.target !== 'contact', { path: ['pay'], message: 'Only students can pay with merits' });

/**
 * §17 Create sale: one sale per student (a whole class means one each), or one for a contact.
 * Paying by invoice raises a Products invoice; paying with merits spends the student's merit balance. Stock goes down.
 */
export async function createSale(db: Db, actor: Actor, raw: unknown) {
  const p = saleInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx): Promise<{ ok: true; n: number } | { ok: false; errors: Record<string, string> }> => {
    const [pr] = await tx.select().from(product).where(and(eq(product.id, v.productId), eq(product.active, true))).for('update');
    if (!pr) return { ok: false as const, errors: { productId: 'Choose an active product' } };
    if (v.pay === 'merits' && !pr.meritPrice) return { ok: false as const, errors: { pay: 'This product can’t be bought with merits' } };
    const buyers = v.target === 'class' ? (await classStudentsOn(tx, v.classId!, v.soldOn)).map((s) => ({ studentId: s.id, contactId: null as number | null }))
      : v.target === 'student' ? [{ studentId: v.studentId!, contactId: null }] : [{ studentId: null as number | null, contactId: v.contactId! }];
    if (!buyers.length) return { ok: false as const, errors: { classId: 'This class has no students' } };
    const needed = buyers.length * v.qty;
    if (pr.stock !== null && pr.stock < needed) return { ok: false as const, errors: { qty: `Only ${pr.stock} left in stock` } };
    if (v.pay === 'merits') {
      const totals = await studentTotals(tx, buyers.map((b) => b.studentId!));
      const short = buyers.filter((b) => (totals.find((t) => t.id === b.studentId)?.balance ?? 0) < pr.meritPrice! * v.qty);
      if (short.length) return { ok: false as const, errors: { pay: `${short.length === 1 ? '1 student doesn’t' : `${short.length} students don’t`} have enough merits` } };
    }
    const [year] = await tx.select().from(academicYear).where(eq(academicYear.isCurrent, true));
    if (v.pay === 'invoice' && !year) return { ok: false as const, errors: { pay: 'Add a current academic year first' } };
    let n = 0;
    for (const b of buyers) {
      // A contact buying for themselves is invoiced against their first linked student (invoices belong to a student).
      const sid = b.studentId ?? (await tx.select({ s: studentContact.studentId }).from(studentContact).where(eq(studentContact.contactId, b.contactId!)).limit(1))[0]?.s ?? null;
      if (v.pay === 'invoice' && !sid) return { ok: false as const, errors: { contactId: 'This contact isn’t linked to a student, so there’s no one to invoice' } };
      const [inv] = v.pay === 'invoice' ? await tx.insert(invoice).values({
        type: 'Products', studentId: sid!, academicYearId: year!.id, billingContactId: b.contactId, invoiceDate: v.soldOn, dueDate: v.soldOn,
        amountPence: pr.pricePence * v.qty, description: `${pr.name}${v.qty > 1 ? ` × ${v.qty}` : ''}`, createdBy: actor.identityId
      }).returning({ id: invoice.id }) : [];
      await tx.insert(productSale).values({ productId: pr.id, studentId: b.studentId, contactId: b.contactId, classId: v.classId, qty: v.qty, soldOn: v.soldOn,
        totalPence: v.pay === 'invoice' ? pr.pricePence * v.qty : 0, meritsSpent: v.pay === 'merits' ? pr.meritPrice! * v.qty : 0, invoiceId: inv?.id ?? null, createdBy: actor.identityId });
      n++;
    }
    if (pr.stock !== null) await tx.update(product).set({ stock: pr.stock - needed }).where(eq(product.id, pr.id));
    await audit(tx, actor, { action: `Sold ${pr.name} × ${v.qty} to ${n === 1 ? '1 buyer' : `${n} buyers`} (${v.pay === 'merits' ? 'merits' : 'invoiced'})`, page: 'Products', entity: 'product_sale' });
    return { ok: true as const, n };
  });
}

export const listSales = (db: DbOrTx) => db.select({ s: productSale, productName: product.name, studentName: sql<string | null>`${student.firstName} || ' ' || ${student.surname}`, contactName: contact.name, className: schoolClass.name })
  .from(productSale).innerJoin(product, eq(product.id, productSale.productId)).leftJoin(student, eq(student.id, productSale.studentId)).leftJoin(contact, eq(contact.id, productSale.contactId))
  .leftJoin(schoolClass, eq(schoolClass.id, productSale.classId)).orderBy(desc(productSale.soldOn), desc(productSale.id)).limit(1000);

export async function markDelivered(db: Db, actor: Actor, ids: number[], delivered: boolean) {
  if (!ids.length) return 0;
  const rows = await db.update(productSale).set({ deliveredAt: delivered ? new Date() : null }).where(inArray(productSale.id, ids)).returning({ id: productSale.id });
  await audit(db, actor, { action: `Marked ${rows.length === 1 ? '1 sale' : `${rows.length} sales`} ${delivered ? 'delivered' : 'not delivered'}`, page: 'Products', entity: 'product_sale', details: { ids } });
  return rows.length;
}
