import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { absenceNotice, classAssignment, classroom, contact, exam, homework, homeworkStudent, registerSession, student, studentContact, subject, teacherLog, timetableSlot } from '@/db/schema';
import { audit } from '../audit';
import { addDays, classStudentsOn, closures, weekdayOf } from '../attendance/registers';
import { listHolidayRequests } from '../attendance/requests';
import { listHomework } from '../learning/homework';
import { todayIso } from '../people/common';
import type { TeacherCtx } from './access';

/* §20 Teacher portal reads. Everything is limited to the classes in the teacher's context (and their privileges). */

const ids = (ctx: TeacherCtx) => ctx.classes.map((c) => c.id);

/** "Your classes today" (design: TeacherToday): each timetabled session for the teacher's classes, whether its register is taken, and the class size. */
export async function classesToday(db: DbOrTx, ctx: TeacherCtx, date = todayIso()) {
  const classIds = ids(ctx);
  if (!classIds.length) return [];
  const [slots, closed, taken] = await Promise.all([
    db.select({ s: timetableSlot, room: classroom.name, subject: subject.name }).from(timetableSlot).leftJoin(classroom, eq(classroom.id, timetableSlot.classroomId)).leftJoin(subject, eq(subject.id, timetableSlot.subjectId))
      .where(and(inArray(timetableSlot.classId, classIds), eq(timetableSlot.weekday, weekdayOf(date)))).orderBy(asc(timetableSlot.startTime)),
    closures(db, classIds, date, date),
    db.select().from(registerSession).where(and(inArray(registerSession.classId, classIds), eq(registerSession.date, date)))
  ]);
  const sizes = new Map<number, number>();
  for (const id of classIds) sizes.set(id, (await classStudentsOn(db, id, date)).length);
  return slots.filter((x) => !closed(x.s.classId!, date)).map((x) => {
    const c = ctx.classes.find((k) => k.id === x.s.classId)!;
    const start = x.s.startTime.slice(0, 5);
    const [h, m] = start.split(':').map(Number) as [number, number];
    const endMin = h * 60 + m + x.s.durationMinutes;
    return {
      classId: c.id, className: c.name, canRegister: c.canRegister, start, end: `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
      room: x.room, subject: x.subject, takesRegister: x.s.takesRegister, students: sizes.get(c.id) ?? 0,
      taken: taken.some((t) => t.classId === c.id && t.startTime.slice(0, 5) === start && t.takenAt)
    };
  });
}

/** Parents' "absent / late today" notices for students in the teacher's classes. */
export async function notesToday(db: DbOrTx, ctx: TeacherCtx, date = todayIso()) {
  const classIds = ids(ctx);
  if (!classIds.length) return [];
  return db.select({ n: absenceNotice, firstName: student.firstName, surname: student.surname, classId: classAssignment.classId }).from(absenceNotice)
    .innerJoin(student, eq(student.id, absenceNotice.studentId))
    .innerJoin(classAssignment, and(eq(classAssignment.studentId, absenceNotice.studentId), inArray(classAssignment.classId, classIds), isNull(classAssignment.toDate)))
    .where(eq(absenceNotice.date, date)).orderBy(asc(student.firstName));
}

/** The teacher's own log for a day. */
export const myLog = async (db: DbOrTx, teacherId: number, date = todayIso()) =>
  (await db.select().from(teacherLog).where(and(eq(teacherLog.teacherId, teacherId), eq(teacherLog.date, date))).limit(1))[0] ?? null;

/** The teacher's logs for the last few weeks. */
export const myLogs = (db: DbOrTx, teacherId: number, days = 42) =>
  db.select().from(teacherLog).where(and(eq(teacherLog.teacherId, teacherId), gte(teacherLog.date, addDays(todayIso(), -days)))).orderBy(desc(teacherLog.date));

/** Adjusts today's sign-in or sign-out time (when Settings → Teacher portal allows it). */
export async function adjustMyLog(db: Db, actor: { identityId: number; name: string }, ctx: TeacherCtx, raw: { timeIn: string; timeOut: string }) {
  if (!ctx.tab.quickLogAdjust) return { ok: false as const, error: 'Ask the office to change your log' };
  const t = (v: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : v === '' ? null : undefined);
  const timeIn = t(raw.timeIn), timeOut = t(raw.timeOut);
  if (timeIn === undefined || timeOut === undefined) return { ok: false as const, error: 'Use times like 17:05' };
  if (timeIn && timeOut && timeOut < timeIn) return { ok: false as const, error: 'Signing out can’t be before signing in' };
  const date = todayIso();
  await db.insert(teacherLog).values({ teacherId: ctx.teacher.id, date, timeIn, timeOut, source: 'portal', updatedBy: actor.identityId })
    .onConflictDoUpdate({ target: [teacherLog.teacherId, teacherLog.date], set: { timeIn, timeOut, absent: false, source: 'portal', loggedAt: new Date(), updatedBy: actor.identityId } });
  await audit(db, actor, { action: `Adjusted own log for ${date} (${timeIn ?? '—'} to ${timeOut ?? '—'})`, page: 'Teacher portal', entity: 'teacher', entityId: ctx.teacher.id });
  return { ok: true as const };
}

/** Homework for the teacher's homework classes, newest deadline first, with hand-in counts. */
export async function myHomework(db: DbOrTx, ctx: TeacherCtx) {
  const allowed = ctx.classes.filter((c) => c.canHomework).map((c) => c.id);
  if (!allowed.length) return [];
  return (await listHomework(db, { yearId: ctx.year?.id, active: true })).filter((r) => allowed.includes(r.h.classId)).slice(0, 40);
}

/** Who has (and hasn't) done one piece of homework: completed by the teacher, or handed in from the parent portal. */
export async function homeworkRoster(db: DbOrTx, homeworkId: number) {
  return db.select({ id: student.id, firstName: student.firstName, surname: student.surname, completedAt: homeworkStudent.completedAt, uploadedAt: homeworkStudent.uploadedAt, uploadFileId: homeworkStudent.uploadFileId, note: homeworkStudent.note })
    .from(homeworkStudent).innerJoin(student, eq(student.id, homeworkStudent.studentId)).where(eq(homeworkStudent.homeworkId, homeworkId)).orderBy(asc(student.firstName), asc(student.surname));
}
export const homeworkRow = async (db: DbOrTx, id: number) => (await db.select().from(homework).where(eq(homework.id, id)))[0] ?? null;

/** Holiday requests that include a student in the teacher's classes (read-only; the office decides). */
export async function myHolidayRequests(db: DbOrTx, ctx: TeacherCtx) {
  const roster = new Set((await studentsOf(db, ids(ctx))).map((s) => s.id));
  return (await listHolidayRequests(db)).filter((r) => r.students.some((s) => roster.has(s.id)))
    .map((r) => ({ ...r, students: r.students.filter((s) => roster.has(s.id)) })).slice(0, 50);
}

const studentsOf = (db: DbOrTx, classIds: number[]) => classIds.length
  ? db.select({ id: classAssignment.studentId }).from(classAssignment).where(and(inArray(classAssignment.classId, classIds), isNull(classAssignment.toDate)))
  : Promise.resolve([]);

/** A student in one of the teacher's classes, with what the school lets teachers see (Settings → Teacher portal). */
export async function studentProfile(db: DbOrTx, ctx: TeacherCtx, studentId: number) {
  const [inClass] = await db.select({ classId: classAssignment.classId }).from(classAssignment)
    .where(and(eq(classAssignment.studentId, studentId), inArray(classAssignment.classId, ids(ctx).length ? ids(ctx) : [0]), isNull(classAssignment.toDate)));
  if (!inClass) return null;
  const [s] = await db.select().from(student).where(eq(student.id, studentId));
  const show = ctx.tab.studentPersonal as string[];
  const contacts = ctx.tab.showParentContacts ? await db.select({ name: contact.name, type: studentContact.type, isPrimary: studentContact.isPrimary, mobile: contact.mobile, email: contact.email })
    .from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).where(eq(studentContact.studentId, studentId)) : [];
  return {
    id: s!.id, name: `${s!.firstName} ${s!.surname}`, classId: inClass.classId, hasMedical: s!.hasMedical,
    dob: show.includes('DOB') ? s!.dob : null, email: show.includes('Email') ? s!.email : null, mobile: show.includes('Mobile') ? s!.mobile : null,
    address: show.includes('Address') ? [s!.address, s!.postcode].filter(Boolean).join(', ') : null, contacts
  };
}

/** Exams and progressive tests for the teacher's classes this year. */
export const myExams = (db: DbOrTx, ctx: TeacherCtx) => ids(ctx).length
  ? db.select().from(exam).where(inArray(exam.classId, ids(ctx))).orderBy(desc(exam.date))
  : Promise.resolve([]);

