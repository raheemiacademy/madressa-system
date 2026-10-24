import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { absenceNotice, attendanceMark, classAssignment, contact, holidayRequest, holidayRequestStudent, registerSession, student } from '@/db/schema';
import { isoDate } from '@/lib/validate';
import { audit, type AuditActor } from '../audit';
import { todayIso, type Actor } from '../people/common';
import { datesBetween, expectedSessions, registerMode } from './registers';

/* ───────── Parent absence notices ("will be absent / late today") ───────── */

export const noticeInput = z.object({
  studentId: z.coerce.number().int().positive(),
  kind: z.enum(['absent', 'late']),
  date: isoDate,
  expectedArrival: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional().transform((v) => v || null),
  reason: z.string().trim().max(500).optional().transform((v) => v || null)
});

/** Called from the parent portal (Phase 8) and tests. The caller must have checked the contact may act for the student. */
export async function createNotice(db: Db, contactId: number | null, raw: unknown) {
  const p = noticeInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the notice' };
  if (p.data.date < todayIso()) return { ok: false as const, error: 'Choose today or a later date' };
  const [row] = await db.insert(absenceNotice).values({ ...p.data, contactId }).returning();
  return { ok: true as const, id: row!.id };
}

export const noticesOn = (db: DbOrTx, date: string) => db.select({ n: absenceNotice, firstName: student.firstName, surname: student.surname, contact: contact.name,
  classes: sql<string | null>`(select string_agg(c.name, ', ') from class_assignment a join school_class c on c.id = a.class_id where a.student_id = "absence_notice"."student_id" and a.to_date is null)` })
  .from(absenceNotice).innerJoin(student, eq(student.id, absenceNotice.studentId)).leftJoin(contact, eq(contact.id, absenceNotice.contactId))
  .where(eq(absenceNotice.date, date)).orderBy(asc(student.surname));

export const countNotices = async (db: DbOrTx, date: string) => (await db.select({ n: sql<number>`count(*)::int` }).from(absenceNotice).where(eq(absenceNotice.date, date)))[0]?.n ?? 0;

export async function markNoticeSeen(db: Db, actor: Actor, id: number) {
  await db.update(absenceNotice).set({ seenAt: new Date(), seenBy: actor.identityId }).where(and(eq(absenceNotice.id, id), isNull(absenceNotice.seenAt)));
}

/* ───────── Holiday requests ───────── */

export const requestInput = z.object({
  studentIds: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one child').max(10),
  startsOn: isoDate, endsOn: isoDate,
  request: z.string().trim().min(1, 'Say where and why').max(2000)
}).refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'The end date can’t be before the start' })
  .refine((v) => datesBetween(v.startsOn, v.endsOn).length <= 92, { path: ['endsOn'], message: 'Requests can cover up to three months' });

/** From the parent portal (Phase 8) and tests. The caller must have checked the contact may act for these students. */
export async function createHolidayRequest(db: Db, contactId: number | null, raw: unknown) {
  const p = requestInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the request' };
  const { studentIds, ...v } = p.data;
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(holidayRequest).values({ ...v, contactId }).returning();
    await tx.insert(holidayRequestStudent).values(studentIds.map((studentId) => ({ requestId: r!.id, studentId })));
    return { ok: true as const, id: r!.id };
  });
}

export async function listHolidayRequests(db: DbOrTx, status?: string) {
  const rows = await db.select({ r: holidayRequest, from: contact.name }).from(holidayRequest).leftJoin(contact, eq(contact.id, holidayRequest.contactId))
    .where(status ? sql`${holidayRequest.status} = ${status}` : undefined).orderBy(desc(holidayRequest.createdAt));
  const kids = rows.length ? await db.select({ requestId: holidayRequestStudent.requestId, id: student.id, firstName: student.firstName, surname: student.surname })
    .from(holidayRequestStudent).innerJoin(student, eq(student.id, holidayRequestStudent.studentId)).where(inArray(holidayRequestStudent.requestId, rows.map((r) => r.r.id))) : [];
  return rows.map((r) => ({ ...r, students: kids.filter((k) => k.requestId === r.r.id) }));
}

export const countPendingRequests = async (db: DbOrTx) => (await db.select({ n: sql<number>`count(*)::int` }).from(holidayRequest).where(eq(holidayRequest.status, 'Pending')))[0]?.n ?? 0;

export const respondInput = z.object({
  action: z.enum(['accept-authorised', 'accept-unauthorised', 'info', 'decline']),
  response: z.string().trim().max(2000).optional().transform((v) => v || null)
});

/**
 * Accept (as authorised or unauthorised), request more info, or decline.
 * Accepting marks the children absent on every expected register in the dates, with the request number in the note.
 */
export async function respondToRequest(db: Db, actor: AuditActor & { identityId: number }, id: number, raw: unknown) {
  const p = respondInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: 'Choose a response' };
  const v = p.data;
  const mode = await registerMode(db);
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(holidayRequest).where(eq(holidayRequest.id, id)).limit(1);
    if (!r) return { ok: false as const, error: 'That request no longer exists.' };
    const status = v.action === 'info' ? 'Info requested' : v.action === 'decline' ? 'Declined' : 'Accepted';
    const acceptedAs = v.action === 'accept-authorised' ? 'authorised' : v.action === 'accept-unauthorised' ? 'unauthorised' : null;
    await tx.update(holidayRequest).set({ status, acceptedAs, response: v.response, respondedAt: new Date(), respondedBy: actor.identityId }).where(eq(holidayRequest.id, id));
    let marked = 0;
    if (acceptedAs) {
      const kids = (await tx.select({ id: holidayRequestStudent.studentId }).from(holidayRequestStudent).where(eq(holidayRequestStudent.requestId, id))).map((k) => k.id);
      const authorised = acceptedAs === 'authorised';
      for (const sid of kids) {
        const assigns = await tx.select().from(classAssignment).where(and(eq(classAssignment.studentId, sid), lte(classAssignment.fromDate, r.endsOn), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, r.startsOn))));
        for (const date of datesBetween(r.startsOn, r.endsOn)) for (const a of assigns.filter((x) => x.fromDate <= date && (!x.toDate || x.toDate >= date))) {
          for (const slot of await expectedSessions(tx, a.classId, date)) {
            const [s] = await tx.insert(registerSession).values({ classId: a.classId, date, startTime: slot.startTime.slice(0, 5), slotId: slot.id })
              .onConflictDoUpdate({ target: [registerSession.classId, registerSession.date, registerSession.startTime], set: { slotId: slot.id } }).returning();
            const values = { mark: 'absent' as const, code: mode === 'dfe' ? (authorised ? 'C' : 'G') : null, authorised, notified: true, note: `Holiday request #${id}`, updatedBy: actor.identityId, updatedAt: new Date() };
            await tx.insert(attendanceMark).values({ sessionId: s!.id, studentId: sid, ...values }).onConflictDoUpdate({ target: [attendanceMark.sessionId, attendanceMark.studentId], set: values });
            marked++;
          }
        }
      }
    }
    await audit(tx, actor, { action: `${status === 'Accepted' ? `Accepted holiday request #${id} as ${acceptedAs}` : status === 'Declined' ? `Declined holiday request #${id}` : `Asked for more information on holiday request #${id}`}${marked ? ` (${marked} register entries)` : ''}`, page: 'Holiday requests', entity: 'holiday_request', entityId: id });
    return { ok: true as const, marked };
  });
}

export async function deleteHolidayRequest(db: Db, actor: AuditActor, id: number) {
  await db.transaction(async (tx) => {
    const [r] = await tx.delete(holidayRequest).where(eq(holidayRequest.id, id)).returning();
    if (r) await audit(tx, actor, { action: `Deleted holiday request #${id}`, page: 'Holiday requests', entity: 'holiday_request', entityId: id });
  });
}

/** Edit a request's dates or text (office corrections). */
export async function editHolidayRequest(db: Db, actor: AuditActor, id: number, raw: unknown) {
  const p = z.object({ startsOn: isoDate, endsOn: isoDate, request: z.string().trim().min(1).max(2000) }).refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'The end date can’t be before the start' }).safeParse(raw);
  if (!p.success) return { ok: false as const, errors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  await db.transaction(async (tx) => {
    await tx.update(holidayRequest).set(p.data).where(eq(holidayRequest.id, id));
    await audit(tx, actor, { action: `Edited holiday request #${id}`, page: 'Holiday requests', entity: 'holiday_request', entityId: id });
  });
  return { ok: true as const };
}

