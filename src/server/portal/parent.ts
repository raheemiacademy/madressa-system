import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import {
  absenceNotice, certificate, classroom, detailsConfirmation, eotyReport, event, eventOptIn, exam, holiday, holidayRequest, homework, homeworkStudent, incident,
  merit, meritAward, product, student, studentContact, contact, teacher, timetableSlot, walkHomeConsent
} from '@/db/schema';
import { summarise } from '@/lib/attendance';
import { formatInstant } from '@/lib/dates';
import { audit } from '../audit';
import { addDays, closures, codeMap, marksBetween, weekdayOf } from '../attendance/registers';
import { examResults } from '../learning/exams';
import { studentTotals } from '../learning/merits';
import { todayIso } from '../people/common';
import { storeUpload } from '../storage';
import { childOf, type Kid, type ParentCtx } from './access';

/* §20 Parent portal reads and writes. Every function takes a child the parent is linked to (childOf) or the parent's context. */

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (t: string) => t.slice(0, 5);

/** The child's next timetabled session in the coming fortnight, skipping holidays and closures. */
export async function nextClass(db: DbOrTx, kid: Kid, now = new Date()) {
  if (!kid.classId) return null;
  const today = todayIso(now), time = formatInstant(now, 'HH:mm');
  const [slots, closed] = await Promise.all([
    db.select({ s: timetableSlot, room: classroom.name, teacherName: teacher.name }).from(timetableSlot).leftJoin(classroom, eq(classroom.id, timetableSlot.classroomId)).leftJoin(teacher, eq(teacher.id, timetableSlot.teacherId))
      .where(eq(timetableSlot.classId, kid.classId)).orderBy(asc(timetableSlot.startTime)),
    closures(db, [kid.classId], today, addDays(today, 14))
  ]);
  for (let i = 0; i <= 14; i++) {
    const d = addDays(today, i);
    if (closed(kid.classId, d)) continue;
    const s = slots.find((x) => x.s.weekday === weekdayOf(d) && (i > 0 || hhmm(x.s.startTime) >= time));
    if (s) return { when: `${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY[weekdayOf(d)]}, ${hhmm(s.s.startTime)}${s.room ? ` · ${s.room}` : ''}`, teacher: s.teacherName };
  }
  return null;
}

/** Attendance this year (present or late, as a %), homework still due, and merit balance. */
export async function childFigures(db: DbOrTx, kid: Kid, yearStart: string, now = new Date()) {
  const today = todayIso(now);
  const [marks, codes, [due], totals] = await Promise.all([
    marksBetween(db, yearStart, today, { studentId: kid.id }), codeMap(db),
    db.select({ n: sql<number>`count(*)::int` }).from(homeworkStudent).innerJoin(homework, eq(homework.id, homeworkStudent.homeworkId))
      .where(and(eq(homeworkStudent.studentId, kid.id), isNull(homeworkStudent.completedAt), isNull(homeworkStudent.uploadedAt), eq(homework.active, true), gte(homework.deadlineAt, now))),
    studentTotals(db, [kid.id])
  ]);
  return { attendance: summarise(marks, codes), homeworkDue: due!.n, merits: totals[0]?.balance ?? 0 };
}

/** "From the school": holidays starting in the next 30 days (or under way), and events this child can still opt in to. */
export async function schoolNews(db: DbOrTx, kids: Kid[], yearId: number | null, today = todayIso()) {
  if (!yearId) return { holidays: [], events: [] };
  const classIds = kids.map((k) => k.classId).filter((c): c is number => !!c);
  const [hols, evs] = await Promise.all([
    db.select().from(holiday).where(and(eq(holiday.academicYearId, yearId), eq(holiday.showParent, true), gte(holiday.endsOn, today), lte(holiday.startsOn, addDays(today, 30)))).orderBy(asc(holiday.startsOn)),
    db.select().from(event).where(and(eq(event.academicYearId, yearId), eq(event.active, true), gte(event.date, today), or(isNull(event.optInDeadline), gte(event.optInDeadline, today)))).orderBy(asc(event.date))
  ]);
  return { holidays: hols, events: evs.filter((e) => !e.classIds.length || e.classIds.some((c) => classIds.includes(c))) };
}

/** Attendance for one child: this year's summary and the latest marks. */
export async function childAttendance(db: DbOrTx, kid: Kid, yearStart: string, today = todayIso()) {
  const [marks, codes] = await Promise.all([marksBetween(db, yearStart, today, { studentId: kid.id }), codeMap(db)]);
  return { summary: summarise(marks, codes), recent: marks.slice(-20).reverse(), codes };
}

/** Notices and holiday requests this parent has sent for their children. */
export async function sentRequests(db: DbOrTx, ctx: ParentCtx) {
  const ids = ctx.kids.map((k) => k.id);
  if (!ids.length) return { notices: [], requests: [] };
  const [notices, requests] = await Promise.all([
    db.select().from(absenceNotice).where(and(inArray(absenceNotice.studentId, ids), gte(absenceNotice.date, addDays(todayIso(), -30)))).orderBy(desc(absenceNotice.date)).limit(20),
    db.select({ r: holidayRequest, kids: sql<string>`(select string_agg(s.first_name, ', ' order by s.first_name) from holiday_request_student hs join student s on s.id = hs.student_id where hs.request_id = "holiday_request"."id")` })
      .from(holidayRequest).where(sql`exists (select 1 from holiday_request_student hs where hs.request_id = "holiday_request"."id" and hs.student_id in ${ids})`)
      .orderBy(desc(holidayRequest.createdAt)).limit(20)
  ]);
  return { notices, requests };
}

/** Homework set for this child, newest first, with whether it's been handed in, is due, or was missed. */
export async function childHomework(db: DbOrTx, kid: Kid, now = new Date()) {
  const rows = await db.select({ h: homework, hs: homeworkStudent, teacherName: teacher.name }).from(homeworkStudent)
    .innerJoin(homework, eq(homework.id, homeworkStudent.homeworkId)).leftJoin(teacher, eq(teacher.id, homework.teacherId))
    .where(and(eq(homeworkStudent.studentId, kid.id), eq(homework.active, true))).orderBy(desc(homework.deadlineAt)).limit(60);
  return rows.map((r) => {
    const done = !!(r.hs.completedAt || r.hs.uploadedAt);
    const closed = r.h.locked || (r.h.lockAfterDeadline && r.h.deadlineAt < now);
    return { ...r.h, teacherName: r.teacherName, note: r.hs.note, uploadFileId: r.hs.uploadFileId, uploadedAt: r.hs.uploadedAt, completedAt: r.hs.completedAt,
      status: done ? 'Handed in' : r.h.deadlineAt < now ? 'Missed' : 'Due', canUpload: r.h.allowUploads && !closed };
  });
}

/** Hands in (or replaces) a child's homework file from the portal. Uploads must be allowed and the homework not locked. */
export async function uploadHomework(db: Db, actor: { identityId: number; name: string }, ctx: ParentCtx, studentId: number, homeworkId: number, file: File | null) {
  const kid = childOf(ctx, studentId);
  const hw = (await childHomework(db, kid)).find((h) => h.id === homeworkId);
  if (!hw) return { ok: false as const, error: 'This homework isn’t set for your child' };
  if (!hw.canUpload) return { ok: false as const, error: hw.allowUploads ? 'This homework is locked' : 'This homework doesn’t take uploads' };
  if (!file || !file.size) return { ok: false as const, error: 'Choose a file to hand in' };
  const up = await storeUpload(db, file, 'homework', 'homework-upload', actor.identityId);
  if (!up.ok) return up;
  await db.update(homeworkStudent).set({ uploadFileId: up.file.id, uploadedAt: new Date() }).where(and(eq(homeworkStudent.homeworkId, homeworkId), eq(homeworkStudent.studentId, kid.id)));
  await audit(db, actor, { action: `Handed in homework “${hw.title}” for ${kid.firstName} ${kid.surname}`, page: 'Parent portal', entity: 'homework', entityId: homeworkId });
  return { ok: true as const };
}

/** Removes a handed-in file while the homework is still open. */
export async function removeHomeworkUpload(db: Db, actor: { identityId: number; name: string }, ctx: ParentCtx, studentId: number, homeworkId: number) {
  const kid = childOf(ctx, studentId);
  const hw = (await childHomework(db, kid)).find((h) => h.id === homeworkId);
  if (!hw?.canUpload) return { ok: false as const, error: 'This homework is locked' };
  await db.update(homeworkStudent).set({ uploadFileId: null, uploadedAt: null }).where(and(eq(homeworkStudent.homeworkId, homeworkId), eq(homeworkStudent.studentId, kid.id)));
  await audit(db, actor, { action: `Removed a homework upload for ${kid.firstName} ${kid.surname}`, page: 'Parent portal', entity: 'homework', entityId: homeworkId });
  return { ok: true as const };
}

/** Events for this child's class (or every class) from today on, with this child's opt-in if any. */
export async function childEvents(db: DbOrTx, kid: Kid, yearId: number | null, today = todayIso()) {
  if (!yearId) return [];
  const [evs, mine] = await Promise.all([
    db.select().from(event).where(and(eq(event.academicYearId, yearId), eq(event.active, true), gte(event.date, today))).orderBy(asc(event.date)),
    db.select().from(eventOptIn).where(eq(eventOptIn.studentId, kid.id))
  ]);
  return evs.filter((e) => !e.classIds.length || (kid.classId !== null && e.classIds.includes(kid.classId)))
    .map((e) => ({ ...e, optIn: mine.find((o) => o.eventId === e.id) ?? null, open: !e.optInDeadline || e.optInDeadline >= today }));
}

/** Incidents the school chose to show on the portal for this child. */
export const childIncidents = (db: DbOrTx, kid: Kid) => db.select().from(incident)
  .where(and(eq(incident.studentId, kid.id), eq(incident.onPortal, true))).orderBy(desc(incident.occurredAt)).limit(50);

/** Merits awarded to the child, the balance, and certificates shown on the portal. */
export async function childMerits(db: DbOrTx, kid: Kid) {
  const [awards, totals, certs] = await Promise.all([
    db.select({ a: meritAward, name: merit.name }).from(meritAward).innerJoin(merit, eq(merit.id, meritAward.meritId)).where(eq(meritAward.studentId, kid.id)).orderBy(desc(meritAward.awardedOn), desc(meritAward.id)).limit(60),
    studentTotals(db, [kid.id]),
    db.select().from(certificate).where(and(eq(certificate.studentId, kid.id), eq(certificate.onPortal, true))).orderBy(desc(certificate.issuedOn))
  ]);
  return { awards, total: totals[0] ?? { points: 0, spent: 0, balance: 0 }, certificates: certs };
}

export const activeProducts = (db: DbOrTx) => db.select().from(product).where(eq(product.active, true)).orderBy(asc(product.name));

/** Official exams and progressive tests for the child's class that are closed or locked (marking finished), with the child's own row. */
export async function childResults(db: DbOrTx, kid: Kid) {
  if (!kid.classId) return [];
  const exams = await db.select().from(exam).where(and(eq(exam.classId, kid.classId), inArray(exam.status, ['closed', 'locked']))).orderBy(desc(exam.date));
  const out = [];
  for (const e of exams) {
    const r = await examResults(db, e.id);
    const row = r?.rows.find((x) => x.student.id === kid.id);
    if (r && row) out.push({ exam: e, tests: r.tests, row });
  }
  return out;
}

/** Term reports the school has put on the portal, for this child's class. */
export const portalReports = (db: DbOrTx, yearId: number | null) => yearId
  ? db.select().from(eotyReport).where(and(eq(eotyReport.academicYearId, yearId), eq(eotyReport.onPortal, true))).orderBy(desc(eotyReport.termEnd))
  : Promise.resolve([]);

/** The child's record as the school holds it, with this year's confirmation and walk-home consent. */
export async function childDetails(db: DbOrTx, kid: Kid, yearId: number | null) {
  const [[s], contacts, [conf], [walk]] = await Promise.all([
    db.select().from(student).where(eq(student.id, kid.id)),
    db.select({ name: contact.name, type: studentContact.type, isPrimary: studentContact.isPrimary, mobile: contact.mobile, email: contact.email }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).where(eq(studentContact.studentId, kid.id)),
    yearId ? db.select().from(detailsConfirmation).where(and(eq(detailsConfirmation.studentId, kid.id), eq(detailsConfirmation.academicYearId, yearId))) : Promise.resolve([]),
    db.select().from(walkHomeConsent).where(eq(walkHomeConsent.studentId, kid.id))
  ]);
  return { student: s!, contacts, confirmedAt: conf?.confirmedAt ?? null, walkHome: walk ?? null };
}

/** Confirms the child's details are correct for this academic year. */
export async function confirmDetails(db: Db, actor: { identityId: number; name: string }, ctx: ParentCtx, studentId: number) {
  const kid = childOf(ctx, studentId);
  if (!ctx.year) return { ok: false as const, error: 'There’s no current school year' };
  await db.insert(detailsConfirmation).values({ studentId: kid.id, academicYearId: ctx.year.id, contactId: ctx.contact.id })
    .onConflictDoUpdate({ target: [detailsConfirmation.studentId, detailsConfirmation.academicYearId], set: { confirmedAt: new Date(), contactId: ctx.contact.id } });
  await audit(db, actor, { action: `Confirmed the details of ${kid.firstName} ${kid.surname}`, page: 'Parent portal', entity: 'student', entityId: kid.id });
  return { ok: true as const };
}

/** Gives or withdraws walk-home consent for the child (when the school asks for it). */
export async function setWalkHome(db: Db, actor: { identityId: number; name: string }, ctx: ParentCtx, studentId: number, give: boolean) {
  const kid = childOf(ctx, studentId);
  if (!ctx.tab.walkHomeConsent) return { ok: false as const, error: 'The school doesn’t ask for walk-home consent' };
  if (give) await db.insert(walkHomeConsent).values({ studentId: kid.id, contactId: ctx.contact.id, source: 'portal', recordedBy: actor.identityId })
    .onConflictDoUpdate({ target: walkHomeConsent.studentId, set: { contactId: ctx.contact.id, givenAt: new Date(), source: 'portal', recordedBy: actor.identityId } });
  else await db.delete(walkHomeConsent).where(eq(walkHomeConsent.studentId, kid.id));
  await audit(db, actor, { action: `${give ? 'Gave' : 'Withdrew'} walk-home consent for ${kid.firstName} ${kid.surname}`, page: 'Parent portal', entity: 'student', entityId: kid.id });
  return { ok: true as const };
}

/** Children still needing this year's details confirmation, when the school requires it. */
export async function unconfirmed(db: DbOrTx, ctx: ParentCtx) {
  if (!ctx.tab.forceConfirmDetails || !ctx.year || !ctx.kids.length) return [];
  const done = await db.select({ id: detailsConfirmation.studentId }).from(detailsConfirmation)
    .where(and(eq(detailsConfirmation.academicYearId, ctx.year.id), inArray(detailsConfirmation.studentId, ctx.kids.map((k) => k.id))));
  return ctx.kids.filter((k) => !done.some((d) => d.id === k.id));
}

