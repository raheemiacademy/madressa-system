import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import {
  applicationGroup, classAssignment, contact, fileObject, holidayClass, schoolClass, student, studentFile, studentNote, walkHomeConsent
} from '@/db/schema';
import { checkbox, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from './common';

/* ───────── Application groups (§5 Registration pages) ───────── */

export const groupInput = z.object({
  name: z.string().trim().min(1, 'Add a name').max(120),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  enabled: checkbox, required: checkbox, multipleChoice: checkbox,
  description: optionalText(1000)
});

export const listApplicationGroups = (db: DbOrTx) => db.select().from(applicationGroup).orderBy(asc(applicationGroup.sortOrder), asc(applicationGroup.name));

export async function saveApplicationGroup(db: Db, actor: Actor, raw: unknown, id?: number): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const p = groupInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  await db.transaction(async (tx) => {
    const [row] = id ? await tx.update(applicationGroup).set(p.data).where(eq(applicationGroup.id, id)).returning() : await tx.insert(applicationGroup).values(p.data).returning();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} application group ${row!.name}`, page: 'Registration pages', entity: 'application_group', entityId: row!.id });
  });
  return { ok: true };
}

export async function deleteApplicationGroup(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(applicationGroup).where(eq(applicationGroup.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted application group ${row.name}`, page: 'Registration pages', entity: 'application_group', entityId: id });
  });
}

/* ───────── Walk-home consents ───────── */

/** Every current student in a class with their consent (if any). */
export const consentsForClass = (db: DbOrTx, classId: number) => db.select({
  id: student.id, firstName: student.firstName, surname: student.surname,
  givenAt: walkHomeConsent.givenAt, source: walkHomeConsent.source, notes: walkHomeConsent.notes, by: contact.name
}).from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId))
  .leftJoin(walkHomeConsent, eq(walkHomeConsent.studentId, student.id)).leftJoin(contact, eq(contact.id, walkHomeConsent.contactId))
  .where(and(eq(classAssignment.classId, classId), isNull(classAssignment.toDate))).orderBy(asc(student.surname), asc(student.firstName));

export async function setConsent(db: Db, actor: Actor, studentId: number, given: boolean, notes?: string) {
  await db.transaction(async (tx) => {
    if (given) await tx.insert(walkHomeConsent).values({ studentId, source: 'manual', notes: notes?.slice(0, 500) || null, recordedBy: actor.identityId })
      .onConflictDoUpdate({ target: walkHomeConsent.studentId, set: { source: 'manual', notes: notes?.slice(0, 500) || null, recordedBy: actor.identityId, givenAt: new Date() } });
    else await tx.delete(walkHomeConsent).where(eq(walkHomeConsent.studentId, studentId));
    await audit(tx, actor, { action: given ? 'Recorded walk-home consent by hand' : 'Removed walk-home consent', page: 'Walk-home consents', entity: 'student', entityId: studentId });
  });
}

/* ───────── Student notes and attachments (§5 profile) ───────── */

export const notesFor = (db: DbOrTx, studentId: number) => db.select().from(studentNote).where(eq(studentNote.studentId, studentId)).orderBy(desc(studentNote.createdAt));

export async function saveNote(db: Db, actor: Actor, studentId: number, body: string, id?: number) {
  const b = z.string().trim().min(1, 'Write a note').max(5000).safeParse(body);
  if (!b.success) return { ok: false as const, error: b.error.issues[0]!.message };
  await db.transaction(async (tx) => {
    if (id) await tx.update(studentNote).set({ body: b.data, updatedAt: new Date() }).where(and(eq(studentNote.id, id), eq(studentNote.studentId, studentId)));
    else await tx.insert(studentNote).values({ studentId, body: b.data, createdBy: actor.identityId });
    await audit(tx, actor, { action: `${id ? 'Edited' : 'Added'} a student note`, page: 'Student profile', entity: 'student', entityId: studentId });
  });
  return { ok: true as const };
}

export async function deleteNote(db: Db, actor: Actor, studentId: number, id: number) {
  await db.transaction(async (tx) => {
    await tx.delete(studentNote).where(and(eq(studentNote.id, id), eq(studentNote.studentId, studentId)));
    await audit(tx, actor, { action: 'Deleted a student note', page: 'Student profile', entity: 'student', entityId: studentId });
  });
}

export const filesFor = (db: DbOrTx, studentId: number) => db.select({ f: fileObject }).from(studentFile).innerJoin(fileObject, eq(fileObject.id, studentFile.fileId))
  .where(eq(studentFile.studentId, studentId)).orderBy(desc(fileObject.createdAt));

/* ───────── Holiday classes (§3 Calendar: "which classes it applies to") ───────── */

export async function setHolidayClasses(db: DbOrTx, holidayId: number, classIds: number[] | null) {
  await db.delete(holidayClass).where(eq(holidayClass.holidayId, holidayId));
  if (classIds?.length) await db.insert(holidayClass).values(classIds.map((classId) => ({ holidayId, classId })));
}

export const holidayClassNames = (db: DbOrTx, holidayIds: number[]) => holidayIds.length
  ? db.select({ holidayId: holidayClass.holidayId, name: schoolClass.name, classId: schoolClass.id }).from(holidayClass).innerJoin(schoolClass, eq(schoolClass.id, holidayClass.classId))
    .where(sql`${holidayClass.holidayId} in ${holidayIds}`)
  : Promise.resolve([]);
