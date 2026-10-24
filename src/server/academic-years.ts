import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, holiday, invoice, schoolClass } from '@/db/schema';
import { checkbox, isoDate, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit, type AuditActor } from './audit';

export const yearInput = z.object({
  title: z.string().trim().min(1, 'Add a title, for example 2026/27').max(40),
  startsOn: isoDate,
  endsOn: isoDate,
  makeCurrent: checkbox
}).refine((v) => v.endsOn > v.startsOn, { path: ['endsOn'], message: 'The end date must be after the start date' });

export const listYears = (db: DbOrTx) => db.select().from(academicYear).orderBy(desc(academicYear.startsOn));
export const currentYear = async (db: DbOrTx) => (await db.select().from(academicYear).where(eq(academicYear.isCurrent, true)).limit(1))[0] ?? null;

type Result = { ok: true; id: number } | { ok: false; errors: FieldErrors };

export async function saveYear(db: Db, actor: AuditActor, raw: unknown, id?: number): Promise<Result> {
  const p = yearInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx): Promise<Result> => {
    const clash = await tx.select({ id: academicYear.id, title: academicYear.title }).from(academicYear)
      .where(and(lte(academicYear.startsOn, v.endsOn), gte(academicYear.endsOn, v.startsOn), id ? ne(academicYear.id, id) : sql`true`)).limit(1);
    if (clash[0]) return { ok: false as const, errors: { startsOn: `These dates overlap ${clash[0].title}` } };
    const dupe = await tx.select({ id: academicYear.id }).from(academicYear)
      .where(and(sql`lower(${academicYear.title}) = lower(${v.title})`, id ? ne(academicYear.id, id) : sql`true`)).limit(1);
    if (dupe[0]) return { ok: false as const, errors: { title: 'A year with this title already exists' } };
    if (v.makeCurrent) await tx.update(academicYear).set({ isCurrent: false }).where(eq(academicYear.isCurrent, true));
    const values = { title: v.title, startsOn: v.startsOn, endsOn: v.endsOn, ...(v.makeCurrent ? { isCurrent: true } : {}) };
    const [row] = id
      ? await tx.update(academicYear).set(values).where(eq(academicYear.id, id)).returning()
      : await tx.insert(academicYear).values(values).returning();
    if (!row) return { ok: false as const, errors: { title: 'That year no longer exists' } };
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} academic year ${row.title}${v.makeCurrent ? ' (set as current)' : ''}`, page: 'Academic years', entity: 'academic_year', entityId: row.id });
    return { ok: true as const, id: row.id };
  });
}

export async function setCurrentYear(db: Db, actor: AuditActor, id: number) {
  return db.transaction(async (tx) => {
    const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, id)).limit(1);
    if (!y) return false;
    await tx.update(academicYear).set({ isCurrent: false }).where(eq(academicYear.isCurrent, true));
    await tx.update(academicYear).set({ isCurrent: true }).where(eq(academicYear.id, id));
    await audit(tx, actor, { action: `Set ${y.title} as the current year`, page: 'Academic years', entity: 'academic_year', entityId: id });
    return true;
  });
}

export async function deleteYear(db: Db, actor: AuditActor, id: number): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, id)).limit(1);
    if (!y) return { ok: false, error: 'That year no longer exists.' };
    if (y.isCurrent) return { ok: false, error: 'You can’t delete the current year. Make another year current first.' };
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(holiday).where(eq(holiday.academicYearId, id));
    if (used && used.n > 0) return { ok: false, error: `This year has ${used.n === 1 ? '1 holiday' : `${used.n} holidays`}. Delete them first.` };
    const [cls] = await tx.select({ n: sql<number>`count(*)::int` }).from(schoolClass).where(eq(schoolClass.academicYearId, id));
    if (cls && cls.n > 0) return { ok: false, error: `This year has ${cls.n === 1 ? '1 class' : `${cls.n} classes`}. Delete them first.` };
    const [inv] = await tx.select({ n: sql<number>`count(*)::int` }).from(invoice).where(eq(invoice.academicYearId, id));
    if (inv && inv.n > 0) return { ok: false, error: `This year has ${inv.n === 1 ? '1 invoice' : `${inv.n} invoices`}, so it can’t be deleted.` };
    await tx.delete(academicYear).where(eq(academicYear.id, id));
    await audit(tx, actor, { action: `Deleted academic year ${y.title}`, page: 'Academic years', entity: 'academic_year', entityId: id });
    return { ok: true };
  });
}

/** The year a page should show: the switcher's choice if it still exists, else the current year, else the latest. */
export async function resolveYear(db: DbOrTx, chosenId: number | null) {
  const years = await db.select().from(academicYear).orderBy(desc(academicYear.startsOn));
  return { years, year: years.find((y) => y.id === chosenId) ?? years.find((y) => y.isCurrent) ?? years[0] ?? null };
}
