import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { fileObject, homework, homeworkStudent, homeworkTemplate, schoolClass, student, teacher } from '@/db/schema';
import { formatInstant, ukLocal } from '@/lib/dates';
import { optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { classStudentsOn } from '../attendance/registers';
import { enqueueMail } from '../comm/mail';
import { primaryContacts } from '../comm/notify';
import { render } from '../comm/templates';
import { todayIso, type Actor } from '../people/common';
import { readTab } from '../settings';

const when = (d: Date) => formatInstant(d, 'EEE d MMM yyyy, HH:mm');
const checkbox = z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on');

export const homeworkInput = z.object({
  classId: z.coerce.number().int().positive('Choose a class'),
  teacherId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  studentIds: z.array(z.coerce.number().int().positive()).max(500).default([]), // none = the whole class
  title: z.string().trim().min(1, 'Give the homework a title').max(200),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time'),
  lockAfterDeadline: checkbox, allowUploads: checkbox, notifyContacts: checkbox,
  instructions: optionalText(10_000)
});

/** §13 Add homework: set for chosen students or the whole class (as of today), optionally emailing their primary contacts. */
export async function saveHomework(db: Db, actor: Actor, raw: unknown, fileId: string | null = null) {
  const p = homeworkInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  const deadlineAt = ukLocal(v.deadline);
  type R = { ok: true; id: number; students: number; emailed: number } | { ok: false; errors: Record<string, string> };
  return db.transaction(async (tx): Promise<R> => {
    const [c] = await tx.select().from(schoolClass).where(eq(schoolClass.id, v.classId));
    if (!c) return { ok: false, errors: { classId: 'Choose a class' } };
    const roster = (await classStudentsOn(tx, c.id, todayIso())).map((s) => s.id);
    const ids = v.studentIds.length ? v.studentIds.filter((x) => roster.includes(x)) : roster;
    if (!ids.length) return { ok: false, errors: { studentIds: 'This class has no students to set it for' } };
    const [h] = await tx.insert(homework).values({ academicYearId: c.academicYearId, classId: c.id, teacherId: v.teacherId, title: v.title, instructions: v.instructions ?? '', deadlineAt, lockAfterDeadline: v.lockAfterDeadline, allowUploads: v.allowUploads, fileId, createdBy: actor.identityId }).returning();
    await tx.insert(homeworkStudent).values(ids.map((studentId) => ({ homeworkId: h!.id, studentId })));
    let emailed = 0;
    if (v.notifyContacts) {
      const kids = await tx.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).where(inArray(student.id, ids));
      const bcc = String((await readTab(tx, 'homework')).bcc || '') || null;
      for (const pc of (await primaryContacts(tx, ids)).filter((x) => x.email)) {
        const k = kids.find((x) => x.id === pc.studentId)!;
        const m = await render(tx, 'homework.new', { CONTACT_NAME: pc.name, STUDENT_NAME: `${k.firstName} ${k.surname}`, CLASS_NAME: c.name, TITLE: v.title, DEADLINE: when(deadlineAt), INSTRUCTIONS: v.instructions ?? '' });
        emailed += await enqueueMail(tx, [{ to: pc.email!, toName: pc.name, subject: m.subject, html: m.html, bcc, entity: 'homework', entityId: h!.id, createdBy: actor.identityId }]);
      }
    }
    await audit(tx, actor, { action: `Set homework “${v.title}” for ${c.name} (${ids.length === 1 ? '1 student' : `${ids.length} students`})${emailed ? `, emailed ${emailed} contacts` : ''}`, page: 'Homework', entity: 'homework', entityId: h!.id });
    return { ok: true, id: h!.id, students: ids.length, emailed };
  });
}

export type HomeworkFilter = { classId?: number; from?: string; to?: string; active?: boolean; yearId?: number };

/** §13 list: each homework with its class, teacher, how many completed and how many uploaded files. */
export async function listHomework(db: DbOrTx, f: HomeworkFilter = {}) {
  const conds: (SQL | undefined)[] = [f.yearId ? eq(homework.academicYearId, f.yearId) : undefined, f.classId ? eq(homework.classId, f.classId) : undefined,
    f.active === undefined ? undefined : eq(homework.active, f.active),
    f.from ? gte(homework.deadlineAt, ukLocal(`${f.from}T00:00`)) : undefined, f.to ? lt(homework.deadlineAt, ukLocal(`${f.to}T23:59`)) : undefined];
  return db.select({
    h: homework, className: schoolClass.name, teacherName: teacher.name,
    total: sql<number>`(select count(*) from homework_student s where s.homework_id = "homework"."id")`.mapWith(Number),
    completed: sql<number>`(select count(*) from homework_student s where s.homework_id = "homework"."id" and s.completed_at is not null)`.mapWith(Number),
    files: sql<number>`((select count(*) from homework_student s where s.homework_id = "homework"."id" and s.upload_file_id is not null) + (case when "homework"."file_id" is null then 0 else 1 end))`.mapWith(Number)
  }).from(homework).innerJoin(schoolClass, eq(schoolClass.id, homework.classId)).leftJoin(teacher, eq(teacher.id, homework.teacherId))
    .where(and(...conds)).orderBy(desc(homework.deadlineAt)).limit(500);
}

export async function getHomework(db: DbOrTx, id: number) {
  const [h] = await db.select({ h: homework, className: schoolClass.name, teacherName: teacher.name }).from(homework).innerJoin(schoolClass, eq(schoolClass.id, homework.classId)).leftJoin(teacher, eq(teacher.id, homework.teacherId)).where(eq(homework.id, id));
  if (!h) return null;
  const students = await db.select({ s: homeworkStudent, firstName: student.firstName, surname: student.surname, file: fileObject.filename }).from(homeworkStudent)
    .innerJoin(student, eq(student.id, homeworkStudent.studentId)).leftJoin(fileObject, eq(fileObject.id, homeworkStudent.uploadFileId))
    .where(eq(homeworkStudent.homeworkId, id)).orderBy(asc(student.surname), asc(student.firstName));
  return { ...h, students };
}

/** Activate/deactivate, lock/unlock or delete homework. Delete needs Can delete (checked by the caller). */
export async function homeworkBulk(db: Db, actor: Actor, ids: number[], op: 'activate' | 'deactivate' | 'lock' | 'unlock' | 'delete') {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const rows = op === 'delete' ? await tx.delete(homework).where(inArray(homework.id, ids)).returning({ id: homework.id })
      : await tx.update(homework).set(op === 'activate' || op === 'deactivate' ? { active: op === 'activate' } : { locked: op === 'lock' }).where(inArray(homework.id, ids)).returning({ id: homework.id });
    await audit(tx, actor, { action: `${{ activate: 'Activated', deactivate: 'Deactivated', lock: 'Locked', unlock: 'Unlocked', delete: 'Deleted' }[op]} ${rows.length === 1 ? '1 homework' : `${rows.length} homeworks`}`, page: 'Homework', entity: 'homework', details: { ids: rows.map((r) => r.id) } });
    return rows.length;
  });
}

/** Ticks students' homework as completed (or not). */
export async function setCompleted(db: Db, actor: Actor, homeworkId: number, doneIds: number[]) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(homeworkStudent).where(eq(homeworkStudent.homeworkId, homeworkId));
    for (const r of rows) {
      const done = doneIds.includes(r.studentId);
      if (done !== !!r.completedAt) await tx.update(homeworkStudent).set({ completedAt: done ? new Date() : null }).where(and(eq(homeworkStudent.homeworkId, homeworkId), eq(homeworkStudent.studentId, r.studentId)));
    }
    await audit(tx, actor, { action: `Updated homework completion (${doneIds.length} of ${rows.length} done)`, page: 'Homework', entity: 'homework', entityId: homeworkId });
    return rows.length;
  });
}

/** §13 Incomplete report: students who haven't completed active homework that is past its deadline. */
export async function incomplete(db: DbOrTx, f: { classId?: number; from?: string; to?: string } = {}) {
  return db.select({ homeworkId: homework.id, title: homework.title, deadlineAt: homework.deadlineAt, className: schoolClass.name, studentId: student.id, firstName: student.firstName, surname: student.surname })
    .from(homeworkStudent).innerJoin(homework, eq(homework.id, homeworkStudent.homeworkId)).innerJoin(student, eq(student.id, homeworkStudent.studentId)).innerJoin(schoolClass, eq(schoolClass.id, homework.classId))
    .where(and(isNull(homeworkStudent.completedAt), eq(homework.active, true), lt(homework.deadlineAt, new Date()), f.classId ? eq(homework.classId, f.classId) : undefined,
      f.from ? gte(homework.deadlineAt, ukLocal(`${f.from}T00:00`)) : undefined, f.to ? lte(homework.deadlineAt, ukLocal(`${f.to}T23:59`)) : undefined))
    .orderBy(desc(homework.deadlineAt), asc(student.surname)).limit(2000);
}

/** Reminder emails for chosen incomplete homework ("homeworkId:studentId" pairs). A test sends only the first one, to the admin. */
export async function sendReminders(db: Db, actor: Actor & { email?: string }, pairs: [number, number][], test = false) {
  const bcc = String((await readTab(db, 'homework')).bcc || '') || null;
  let queued = 0;
  for (const [hid, sid] of test ? pairs.slice(0, 1) : pairs) {
    const [row] = await db.select({ title: homework.title, deadlineAt: homework.deadlineAt, firstName: student.firstName, surname: student.surname }).from(homeworkStudent)
      .innerJoin(homework, eq(homework.id, homeworkStudent.homeworkId)).innerJoin(student, eq(student.id, homeworkStudent.studentId))
      .where(and(eq(homeworkStudent.homeworkId, hid), eq(homeworkStudent.studentId, sid), isNull(homeworkStudent.completedAt)));
    if (!row) continue;
    const contacts = test ? [{ name: actor.name, email: actor.email ?? null }] : (await primaryContacts(db, [sid])).filter((x) => x.email);
    for (const c of contacts) {
      if (!c.email) continue;
      const m = await render(db, 'homework.reminder', { CONTACT_NAME: c.name, STUDENT_NAME: `${row.firstName} ${row.surname}`, TITLE: row.title, DEADLINE: when(row.deadlineAt) });
      queued += await enqueueMail(db, [{ to: c.email, toName: c.name, subject: test ? `[Test] ${m.subject}` : m.subject, html: m.html, bcc: test ? null : bcc, entity: 'homework', entityId: hid, createdBy: actor.identityId }]);
    }
  }
  if (!test) await audit(db, actor, { action: `Sent homework reminders (${queued})`, page: 'Homework', entity: 'homework' });
  return queued;
}

/** §13 Year report: per student, homework set this year, completed, not completed and %. */
export async function yearReport(db: DbOrTx, yearId: number, classId?: number) {
  const rows = await db.select({ studentId: student.id, firstName: student.firstName, surname: student.surname,
    total: sql<number>`count(*)`.mapWith(Number), completed: sql<number>`count(${homeworkStudent.completedAt})`.mapWith(Number) })
    .from(homeworkStudent).innerJoin(homework, eq(homework.id, homeworkStudent.homeworkId)).innerJoin(student, eq(student.id, homeworkStudent.studentId))
    .where(and(eq(homework.academicYearId, yearId), eq(homework.active, true), classId ? eq(homework.classId, classId) : undefined))
    .groupBy(student.id).orderBy(asc(student.surname), asc(student.firstName));
  return rows.map((r) => ({ ...r, incomplete: r.total - r.completed, pct: r.total ? Math.round((r.completed / r.total) * 1000) / 10 : null }));
}

export async function emailYearReport(db: Db, actor: Actor, yearId: number, studentIds: number[]) {
  const rows = (await yearReport(db, yearId)).filter((r) => studentIds.includes(r.studentId));
  let queued = 0;
  for (const c of (await primaryContacts(db, rows.map((r) => r.studentId))).filter((x) => x.email)) {
    const r = rows.find((x) => x.studentId === c.studentId)!;
    const m = await render(db, 'homework.year-report', { CONTACT_NAME: c.name, STUDENT_NAME: `${r.firstName} ${r.surname}`, TOTAL: String(r.total), COMPLETED: String(r.completed), INCOMPLETE: String(r.incomplete), PERCENT: r.pct === null ? '—' : `${r.pct}%` });
    queued += await enqueueMail(db, [{ to: c.email!, toName: c.name, subject: m.subject, html: m.html, entity: 'student', entityId: r.studentId, createdBy: actor.identityId }]);
  }
  await audit(db, actor, { action: `Emailed homework year reports (${queued})`, page: 'Homework', entity: 'homework' });
  return queued;
}

/** §13 File storage: used vs the limit in Settings → File storage. */
export async function storageUsage(db: DbOrTx) {
  const [u] = await db.select({ bytes: sql<number>`coalesce(sum(${fileObject.size}), 0)`.mapWith(Number) }).from(fileObject);
  const limit = Number((await readTab(db, 'storage')).limitMb) * 1024 * 1024;
  return { used: u?.bytes ?? 0, limit, free: Math.max(0, limit - (u?.bytes ?? 0)) };
}

export const listHomeworkTemplates = (db: DbOrTx) => db.select().from(homeworkTemplate).orderBy(asc(homeworkTemplate.title));
export async function saveHomeworkTemplate(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = z.object({ title: z.string().trim().min(1, 'Give it a title').max(200), instructions: z.string().max(10_000).default('') }).safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(homeworkTemplate).set(p.data).where(eq(homeworkTemplate.id, id)).returning() : await db.insert(homeworkTemplate).values(p.data).returning();
  await audit(db, actor, { action: `Saved homework template “${p.data.title}”`, page: 'Homework', entity: 'homework_template', entityId: row?.id });
  return { ok: true as const };
}
export async function deleteHomeworkTemplate(db: Db, actor: Actor, id: number) {
  const [t] = await db.delete(homeworkTemplate).where(eq(homeworkTemplate.id, id)).returning();
  if (t) await audit(db, actor, { action: `Deleted homework template “${t.title}”`, page: 'Homework', entity: 'homework_template', entityId: id });
}
