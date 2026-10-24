import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, DUE_RULES, feePeriod, feeStructure, feeStructureClass, INTERVAL_UNITS, schoolClass } from '@/db/schema';
import { periodProblem, plusMonths } from '@/lib/fees';
import { formatPence } from '@/lib/money';
import { isoDate, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from '../people/common';
import { pounds } from './invoices';

export const listStructures = (db: DbOrTx, yearId: number) => db.select().from(feeStructure).where(eq(feeStructure.academicYearId, yearId)).orderBy(asc(feeStructure.isAdHoc), asc(feeStructure.name));
export const periodsOf = (db: DbOrTx, structureIds: number[]) => structureIds.length
  ? db.select().from(feePeriod).where(inArray(feePeriod.structureId, structureIds)).orderBy(asc(feePeriod.sortOrder), asc(feePeriod.startsOn), asc(feePeriod.id))
  : Promise.resolve([] as (typeof feePeriod.$inferSelect)[]);

export const annualTotal = (periods: { invoiceCount: number; amountPence: number }[]) => periods.reduce((s, p) => s + p.invoiceCount * p.amountPence, 0);

/** Which structure bills each class of a year: its own, otherwise the year's default (or none). */
export async function structureByClass(db: DbOrTx, yearId: number) {
  const [classes, own, structures] = await Promise.all([
    db.select({ id: schoolClass.id, name: schoolClass.name }).from(schoolClass).where(eq(schoolClass.academicYearId, yearId)),
    db.select({ classId: feeStructureClass.classId, structureId: feeStructureClass.structureId }).from(feeStructureClass).innerJoin(schoolClass, eq(schoolClass.id, feeStructureClass.classId)).where(eq(schoolClass.academicYearId, yearId)),
    listStructures(db, yearId)
  ]);
  const def = structures.find((s) => s.isDefault) ?? null;
  const byId = new Map(structures.map((s) => [s.id, s]));
  return new Map(classes.map((c) => {
    const s = own.find((o) => o.classId === c.id);
    return [c.id, { className: c.name, structure: (s && byId.get(s.structureId)) || def, own: !!s }];
  }));
}

const periodInput = z.object({
  id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1, 'Name each period').max(60),
  startsOn: isoDate, endsOn: isoDate,
  invoiceCount: z.coerce.number().int().min(1, 'At least 1 invoice').max(60),
  intervalCount: z.coerce.number().int().min(1).max(366),
  intervalUnit: z.enum(INTERVAL_UNITS),
  amount: pounds(),
  startWeekday: z.union([z.literal(''), z.coerce.number().int().min(0).max(6)]).transform((v) => (v === '' ? null : v)),
  dueRule: z.enum(DUE_RULES)
});

export const structureInput = z.object({
  name: z.string().trim().min(1, 'Give the structure a name').max(80),
  kind: z.enum(['class', 'default', 'adhoc']),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  periods: z.array(periodInput).max(60)
});

type Result = { ok: true; id: number } | { ok: false; errors: Record<string, string> };

/** Saves a structure and its periods. Existing periods are updated in place, because generated invoices are keyed on the period. */
export async function saveStructure(db: Db, actor: Actor, yearId: number, raw: unknown, id?: number): Promise<Result> {
  const p = structureInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  const errors: Record<string, string> = {};
  v.periods.forEach((x, i) => { const why = periodProblem(x); if (why) errors[`period${i}`] = `${x.name}: ${why}`; });
  if (Object.keys(errors).length) return { ok: false, errors };
  return db.transaction(async (tx): Promise<Result> => {
    const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, yearId)).limit(1);
    if (!y) return { ok: false, errors: { name: 'Choose an academic year first' } };
    const classIds = v.kind === 'class' ? v.classIds : [];
    if (classIds.length) {
      const ok = await tx.select({ id: schoolClass.id }).from(schoolClass).where(and(inArray(schoolClass.id, classIds), eq(schoolClass.academicYearId, yearId)));
      if (ok.length !== new Set(classIds).size) return { ok: false, errors: { classIds: 'Choose classes from this year' } };
    }
    if (v.kind === 'default') {
      const [other] = await tx.select({ id: feeStructure.id }).from(feeStructure).where(and(eq(feeStructure.academicYearId, yearId), eq(feeStructure.isDefault, true))).limit(1);
      if (other && other.id !== id) return { ok: false, errors: { kind: 'This year already has a default structure' } };
    }
    const values = { name: v.name, isDefault: v.kind === 'default', isAdHoc: v.kind === 'adhoc' };
    let sid = id;
    if (sid) {
      const [cur] = await tx.update(feeStructure).set(values).where(and(eq(feeStructure.id, sid), eq(feeStructure.academicYearId, yearId))).returning({ id: feeStructure.id });
      if (!cur) return { ok: false, errors: { name: 'This structure no longer exists' } };
    } else sid = (await tx.insert(feeStructure).values({ ...values, academicYearId: yearId }).returning({ id: feeStructure.id }))[0]!.id;

    // A class has one structure: choosing it here moves it from any other.
    await tx.delete(feeStructureClass).where(eq(feeStructureClass.structureId, sid));
    if (classIds.length) await tx.insert(feeStructureClass).values(classIds.map((classId) => ({ classId, structureId: sid! })))
      .onConflictDoUpdate({ target: feeStructureClass.classId, set: { structureId: sid } });

    const keep = v.periods.map((x) => x.id).filter((x): x is number => !!x);
    await tx.delete(feePeriod).where(and(eq(feePeriod.structureId, sid), keep.length ? notInArray(feePeriod.id, keep) : undefined));
    for (const [i, x] of v.periods.entries()) {
      const row = { name: x.name, startsOn: x.startsOn, endsOn: x.endsOn, invoiceCount: x.invoiceCount, intervalCount: x.intervalCount, intervalUnit: x.intervalUnit, amountPence: x.amount, startWeekday: x.startWeekday, dueRule: x.dueRule, sortOrder: i };
      if (x.id) await tx.update(feePeriod).set(row).where(and(eq(feePeriod.id, x.id), eq(feePeriod.structureId, sid)));
      else await tx.insert(feePeriod).values({ ...row, structureId: sid });
    }
    const total = v.periods.reduce((s, x) => s + x.invoiceCount * x.amount, 0);
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Created'} fees structure “${v.name}” (${formatPence(total)} a year, ${v.periods.length} periods)`, page: 'Fees structure', entity: 'fee_structure', entityId: sid });
    return { ok: true, id: sid };
  });
}

/** A class's fees: one of this year's class structures, or null for the year's default. */
export async function setClassStructure(db: Db, actor: Actor, classId: number, structureId: number | null): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schoolClass).where(eq(schoolClass.id, classId)).limit(1);
    if (!c) return { ok: false, error: 'This class no longer exists' };
    const [s] = structureId ? await tx.select().from(feeStructure).where(and(eq(feeStructure.id, structureId), eq(feeStructure.academicYearId, c.academicYearId), eq(feeStructure.isDefault, false), eq(feeStructure.isAdHoc, false))).limit(1) : [];
    if (structureId && !s) return { ok: false, error: 'Choose one of this year’s class structures' };
    await tx.delete(feeStructureClass).where(eq(feeStructureClass.classId, classId));
    if (s) await tx.insert(feeStructureClass).values({ classId, structureId: s.id });
    await audit(tx, actor, { action: `Set fees for class ${c.name} to ${s ? `“${s.name}”` : 'the default structure'}`, page: 'Classes', entity: 'school_class', entityId: classId });
    return { ok: true };
  });
}

export async function deleteStructure(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [s] = await tx.delete(feeStructure).where(eq(feeStructure.id, id)).returning();
    if (s) await audit(tx, actor, { action: `Deleted fees structure “${s.name}” (invoices already generated are kept)`, page: 'Fees structure', entity: 'fee_structure', entityId: id });
  });
}

/** New Year Wizard "default yearly fees": copy last year's structures, periods shifted by whole years, onto classes with the same name. */
export async function copyStructures(db: Db, actor: Actor, fromYearId: number, toYearId: number) {
  return db.transaction(async (tx) => {
    const [from] = await tx.select().from(academicYear).where(eq(academicYear.id, fromYearId)).limit(1);
    const [to] = await tx.select().from(academicYear).where(eq(academicYear.id, toYearId)).limit(1);
    if (!from || !to) return 0;
    const months = (Number(to.startsOn.slice(0, 4)) - Number(from.startsOn.slice(0, 4))) * 12;
    const [src, existing, oldClasses, newClasses] = await Promise.all([
      listStructures(tx, fromYearId), listStructures(tx, toYearId),
      tx.select({ id: schoolClass.id, name: schoolClass.name, structureId: feeStructureClass.structureId }).from(schoolClass).innerJoin(feeStructureClass, eq(feeStructureClass.classId, schoolClass.id)).where(eq(schoolClass.academicYearId, fromYearId)),
      tx.select({ id: schoolClass.id, name: schoolClass.name }).from(schoolClass).where(eq(schoolClass.academicYearId, toYearId))
    ]);
    const periods = await periodsOf(tx, src.map((s) => s.id));
    let n = 0;
    for (const s of src) {
      if (existing.some((e) => e.name.toLowerCase() === s.name.toLowerCase()) || (s.isDefault && existing.some((e) => e.isDefault))) continue;
      const [ns] = await tx.insert(feeStructure).values({ academicYearId: toYearId, name: s.name, isDefault: s.isDefault, isAdHoc: s.isAdHoc }).returning({ id: feeStructure.id });
      const ps = periods.filter((p) => p.structureId === s.id);
      if (ps.length) await tx.insert(feePeriod).values(ps.map(({ id: _id, structureId: _s, ...p }) => ({ ...p, structureId: ns!.id, startsOn: plusMonths(p.startsOn, months), endsOn: plusMonths(p.endsOn, months) })));
      const names = new Set(oldClasses.filter((c) => c.structureId === s.id).map((c) => c.name.toLowerCase()));
      const cls = newClasses.filter((c) => names.has(c.name.toLowerCase()));
      if (cls.length) await tx.insert(feeStructureClass).values(cls.map((c) => ({ classId: c.id, structureId: ns!.id }))).onConflictDoNothing();
      n++;
    }
    if (n) await audit(tx, actor, { action: `Copied ${n === 1 ? '1 fees structure' : `${n} fees structures`} from ${from.title} to ${to.title}`, page: 'New year wizard', entity: 'fee_structure' });
    return n;
  });
}
