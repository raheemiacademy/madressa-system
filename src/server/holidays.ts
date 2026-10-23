import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, holiday } from '@/db/schema';
import { checkbox, isoDate, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit, type AuditActor } from './audit';

export const holidayInput = z.object({
  academicYearId: z.coerce.number().int().positive('Choose a year'),
  title: z.string().trim().min(1, 'Add a title').max(120),
  description: optionalText(2000),
  startsOn: isoDate, endsOn: isoDate,
  showTeacher: checkbox, showParent: checkbox, showStudent: checkbox,
  studentsAttend: checkbox, teachersAttend: checkbox
}).refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'The end date can’t be before the start date' });

export const listHolidays = (db: DbOrTx, yearId: number) =>
  db.select().from(holiday).where(eq(holiday.academicYearId, yearId)).orderBy(asc(holiday.startsOn));

export async function saveHoliday(db: Db, actor: AuditActor, raw: unknown, id?: number): Promise<{ ok: true; id: number } | { ok: false; errors: FieldErrors }> {
  const p = holidayInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx): Promise<{ ok: true; id: number } | { ok: false; errors: FieldErrors }> => {
    const [y] = await tx.select().from(academicYear).where(eq(academicYear.id, v.academicYearId)).limit(1);
    if (!y) return { ok: false as const, errors: { academicYearId: 'Choose a year' } };
    if (v.startsOn < y.startsOn || v.endsOn > y.endsOn) return { ok: false as const, errors: { startsOn: `Dates must fall within ${y.title}` } };
    const [row] = id
      ? await tx.update(holiday).set(v).where(eq(holiday.id, id)).returning()
      : await tx.insert(holiday).values(v).returning();
    if (!row) return { ok: false as const, errors: { title: 'This holiday no longer exists' } };
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} holiday ${row.title}`, page: 'Calendar / holidays', entity: 'holiday', entityId: row.id });
    return { ok: true as const, id: row.id };
  });
}

export async function deleteHoliday(db: Db, actor: AuditActor, id: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(holiday).where(eq(holiday.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted holiday ${row.title}`, page: 'Calendar / holidays', entity: 'holiday', entityId: id });
    return !!row;
  });
}
