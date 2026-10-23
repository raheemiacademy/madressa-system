import { asc, eq, ne, sql, and } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { yearGroup } from '@/db/schema';
import { zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from './common';

export const yearGroupInput = z.object({
  label: z.string().trim().min(1, 'Add a label').max(60),
  minAge: z.coerce.number().int().min(0, 'Use 0 or more').max(120),
  maxAge: z.coerce.number().int().min(0).max(120),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
}).refine((v) => v.maxAge >= v.minAge, { path: ['maxAge'], message: 'Maximum age must be at least the minimum' });

export const listYearGroups = (db: DbOrTx) => db.select().from(yearGroup).orderBy(asc(yearGroup.sortOrder), asc(yearGroup.minAge));

export async function saveYearGroup(db: Db, actor: Actor, raw: unknown, id?: number): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const p = yearGroupInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  return db.transaction(async (tx) => {
    const clash = await tx.select({ id: yearGroup.id }).from(yearGroup).where(and(sql`lower(${yearGroup.label}) = lower(${p.data.label})`, id ? ne(yearGroup.id, id) : undefined)).limit(1);
    if (clash[0]) return { ok: false as const, errors: { label: 'That label is already used' } };
    const [row] = id ? await tx.update(yearGroup).set(p.data).where(eq(yearGroup.id, id)).returning() : await tx.insert(yearGroup).values(p.data).returning();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} year group ${row!.label}`, page: 'Year & age groups', entity: 'year_group', entityId: row!.id });
    return { ok: true as const };
  });
}

export async function deleteYearGroup(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(yearGroup).where(eq(yearGroup.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted year group ${row.label}`, page: 'Year & age groups', entity: 'year_group', entityId: id });
  });
}
