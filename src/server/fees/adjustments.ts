import { and, asc, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { classAssignment, feeAdjustment, siblingDiscountRule, siblingDiscountSet, siblingLink, student } from '@/db/schema';
import { formatBps, parseAdjustmentAmount, type Adjustment } from '@/lib/fees';
import { formatPence } from '@/lib/money';
import { zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';

export const describeAdjustment = (a: Adjustment | null | undefined) => !a ? 'None'
  : a.kind === 'free' ? 'Free (no fees)' : `${a.kind === 'deduct' ? 'Deduct' : 'Add'} ${a.unit === 'percent' ? formatBps(a.amount) : formatPence(a.amount)}`;

const amountField = z.object({ kind: z.enum(['deduct', 'add', 'free']), amount: z.string().max(20).default(''), unit: z.enum(['pence', 'percent']) })
  .transform((v, ctx) => {
    if (v.kind === 'free') return { kind: v.kind, amount: 0, unit: 'pence' as const };
    const n = parseAdjustmentAmount(v.amount, v.unit);
    if (n === null || n === 0) { ctx.addIssue({ code: 'custom', path: ['amount'], message: v.unit === 'percent' ? 'Enter a percentage up to 100' : 'Enter an amount like 5 or 2.50' }); return z.NEVER; }
    return { kind: v.kind, amount: n, unit: v.unit };
  });

export const adjustmentInput = z.object({ studentIds: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one student').max(2000) }).and(amountField);

/** §2 Fees Adjustments: a standing deduct/add/free set on students; it applies to fees invoices generated from now on. */
export async function setAdjustments(db: Db, actor: Actor, raw: unknown): Promise<{ ok: true; n: number } | { ok: false; errors: Record<string, string> }> {
  const p = adjustmentInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const { studentIds, ...a } = p.data;
  return db.transaction(async (tx) => {
    const ids = (await tx.select({ id: student.id }).from(student).where(inArray(student.id, studentIds))).map((r) => r.id);
    if (!ids.length) return { ok: false as const, errors: { studentIds: 'Choose at least one student' } };
    await tx.insert(feeAdjustment).values(ids.map((studentId) => ({ studentId, ...a, source: 'manual' })))
      .onConflictDoUpdate({ target: feeAdjustment.studentId, set: { ...a, source: 'manual', updatedAt: new Date() } });
    await audit(tx, actor, { action: `Set fees adjustment “${describeAdjustment(a)}” for ${ids.length === 1 ? '1 student' : `${ids.length} students`}`, page: 'Fees adjustments', entity: 'fee_adjustment', details: { ids } });
    return { ok: true as const, n: ids.length };
  });
}

export async function clearAdjustments(db: Db, actor: Actor, studentIds: number[]) {
  if (!studentIds.length) return 0;
  return db.transaction(async (tx) => {
    const gone = await tx.delete(feeAdjustment).where(inArray(feeAdjustment.studentId, studentIds)).returning({ id: feeAdjustment.studentId });
    if (gone.length) await audit(tx, actor, { action: `Removed fees adjustments from ${gone.length === 1 ? '1 student' : `${gone.length} students`}`, page: 'Fees adjustments', entity: 'fee_adjustment', details: { ids: gone.map((g) => g.id) } });
    return gone.length;
  });
}

/** Students with their adjustment, optionally in one class (today) or matching a name. */
export async function adjustmentList(db: DbOrTx, f: { classId?: number; q?: string; without?: boolean }) {
  const today = todayIso();
  const inClass = f.classId ? db.select({ id: classAssignment.studentId }).from(classAssignment)
    .where(and(eq(classAssignment.classId, f.classId), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today)))) : undefined;
  const rows = await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status, a: feeAdjustment })
    .from(student).leftJoin(feeAdjustment, eq(feeAdjustment.studentId, student.id))
    .where(and(inClass ? inArray(student.id, inClass) : eq(student.status, 'Current'), f.without ? isNull(feeAdjustment.studentId) : undefined))
    .orderBy(asc(student.surname), asc(student.firstName));
  const q = f.q?.trim().toLowerCase();
  return q ? rows.filter((r) => `${r.firstName} ${r.surname}`.toLowerCase().includes(q)) : rows;
}

/* ───────── Sibling discounts ───────── */

export const listSets = async (db: DbOrTx) => {
  const [sets, rules] = await Promise.all([db.select().from(siblingDiscountSet).orderBy(asc(siblingDiscountSet.title)), db.select().from(siblingDiscountRule).orderBy(asc(siblingDiscountRule.position))]);
  return sets.map((s) => ({ ...s, rules: rules.filter((r) => r.setId === s.id) }));
};

const ruleInput = z.object({ position: z.coerce.number().int().min(2).max(20) }).and(amountField);
export const setInput = z.object({ title: z.string().trim().min(1, 'Give the set a short title').max(60), rules: z.array(ruleInput).min(1, 'Add a discount for at least the 2nd sibling').max(19) })
  .refine((v) => new Set(v.rules.map((r) => r.position)).size === v.rules.length, { path: ['rules'], message: 'Each sibling position can only appear once' })
  .refine((v) => v.rules.every((r) => r.kind !== 'free'), { path: ['rules'], message: 'Sibling discounts deduct or add an amount' });

export async function saveSet(db: Db, actor: Actor, raw: unknown, id?: number): Promise<{ ok: true; id: number } | { ok: false; errors: Record<string, string> }> {
  const p = setInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const sid = id ? (await tx.update(siblingDiscountSet).set({ title: v.title }).where(eq(siblingDiscountSet.id, id)).returning({ id: siblingDiscountSet.id }))[0]?.id
      : (await tx.insert(siblingDiscountSet).values({ title: v.title }).returning({ id: siblingDiscountSet.id }))[0]!.id;
    if (!sid) return { ok: false as const, errors: { title: 'This set no longer exists' } };
    await tx.delete(siblingDiscountRule).where(eq(siblingDiscountRule.setId, sid));
    await tx.insert(siblingDiscountRule).values(v.rules.map((r) => ({ setId: sid, position: r.position, kind: r.kind, amount: r.amount, unit: r.unit })));
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Created'} sibling discount set “${v.title}”`, page: 'Sibling discounts', entity: 'sibling_discount_set', entityId: sid });
    return { ok: true as const, id: sid };
  });
}

export async function deleteSet(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [s] = await tx.delete(siblingDiscountSet).where(eq(siblingDiscountSet.id, id)).returning();
    if (s) await audit(tx, actor, { action: `Deleted sibling discount set “${s.title}”`, page: 'Sibling discounts', entity: 'sibling_discount_set', entityId: id });
  });
}

/** Families of current students joined by sibling links, eldest first (by date of birth, then ID). */
export async function families(db: DbOrTx) {
  const [links, kids] = await Promise.all([db.select().from(siblingLink), db.select({ id: student.id, firstName: student.firstName, surname: student.surname, dob: student.dob, a: feeAdjustment })
    .from(student).leftJoin(feeAdjustment, eq(feeAdjustment.studentId, student.id)).where(eq(student.status, 'Current'))]);
  const byId = new Map(kids.map((k) => [k.id, k]));
  const parent = new Map<number, number>();
  const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const l of links) if (byId.has(l.studentA) && byId.has(l.studentB)) parent.set(find(l.studentA), find(l.studentB));
  const groups = new Map<number, typeof kids>();
  for (const k of kids) { const r = find(k.id); if (r !== k.id || links.some((l) => l.studentA === k.id || l.studentB === k.id)) groups.set(r, [...(groups.get(r) ?? []), k]); }
  return [...groups.values()].filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (a.dob ?? '9999').localeCompare(b.dob ?? '9999') || a.id - b.id))
    .sort((a, b) => a[0]!.surname.localeCompare(b[0]!.surname));
}

/**
 * §2 "Assign Adjustments Now": each family's 2nd, 3rd… child gets that position's discount (a child beyond the last
 * position gets the last one). Manual adjustments are left alone; the eldest loses any old sibling discount.
 */
export async function assignSiblingDiscounts(db: Db, actor: Actor, setId: number): Promise<{ ok: true; assigned: number; skipped: number } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const set = (await listSets(tx)).find((s) => s.id === setId);
    if (!set) return { ok: false as const, error: 'Choose a discount set' };
    let assigned = 0, skipped = 0;
    for (const fam of await families(tx)) {
      for (const [i, kid] of fam.entries()) {
        if (kid.a?.source === 'manual') { if (i > 0) skipped++; continue; }
        const rule = [...set.rules].reverse().find((r) => r.position <= i + 1);
        if (i === 0 || !rule) { if (kid.a) await tx.delete(feeAdjustment).where(eq(feeAdjustment.studentId, kid.id)); continue; }
        const a = { kind: rule.kind, amount: rule.amount, unit: rule.unit, source: 'sibling', updatedAt: new Date() };
        await tx.insert(feeAdjustment).values({ studentId: kid.id, ...a }).onConflictDoUpdate({ target: feeAdjustment.studentId, set: a });
        assigned++;
      }
    }
    await audit(tx, actor, { action: `Assigned sibling discounts from “${set.title}”: ${assigned} set, ${skipped} kept their own adjustment`, page: 'Sibling discounts', entity: 'fee_adjustment' });
    return { ok: true as const, assigned, skipped };
  });
}

/** A student and everyone linked to them as a sibling (any status), for the combined family fees view. */
export async function familyOf(db: DbOrTx, studentId: number) {
  const seen = new Set([studentId]);
  let frontier = [studentId];
  while (frontier.length) {
    const links = await db.select().from(siblingLink).where(or(inArray(siblingLink.studentA, frontier), inArray(siblingLink.studentB, frontier)));
    frontier = links.flatMap((l) => [l.studentA, l.studentB]).filter((x) => !seen.has(x));
    frontier.forEach((x) => seen.add(x));
    if (seen.size > 30) break;
  }
  return db.select({ id: student.id, firstName: student.firstName, surname: student.surname, dob: student.dob, status: student.status }).from(student).where(inArray(student.id, [...seen])).orderBy(asc(student.dob), asc(student.id));
}
