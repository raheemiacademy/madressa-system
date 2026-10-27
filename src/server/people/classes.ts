import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import {
  academicYear, classAssignment, classroom, classTeacher, schoolClass, student, subject, teacher, timetableSlot, timetableTemplate, yearGroup
} from '@/db/schema';
import { checkbox, isoDate, optionalIsoDate, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import { catchFieldFail, FieldFail, idList, todayIso, type Actor } from './common';
import { assignClass } from './students';

const optId = z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (typeof v === 'number' ? v : null));

export const classInput = z.object({
  academicYearId: z.coerce.number().int().positive('Choose a year'),
  name: z.string().trim().min(1, 'Add a class name').max(80),
  yearGroupId: optId,
  mainTeacherId: optId,
  capacity: z.union([z.literal(''), z.coerce.number().int().min(0).max(1000)]).optional().transform((v) => (typeof v === 'number' ? v : null)),
  startsOn: optionalIsoDate, endsOn: optionalIsoDate,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0)
}).refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'End must be after the start' });

type R = { ok: true; id: number } | { ok: false; errors: FieldErrors };

export async function saveClass(db: Db, actor: Actor, raw: unknown, id?: number): Promise<R> {
  const p = classInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx): Promise<R> => {
    const dupe = await tx.select({ id: schoolClass.id }).from(schoolClass)
      .where(and(eq(schoolClass.academicYearId, v.academicYearId), sql`lower(${schoolClass.name}) = lower(${v.name})`, id ? ne(schoolClass.id, id) : undefined)).limit(1);
    if (dupe[0]) return { ok: false, errors: { name: 'This year already has a class with that name' } };
    const [row] = id ? await tx.update(schoolClass).set(v).where(eq(schoolClass.id, id)).returning() : await tx.insert(schoolClass).values(v).returning();
    if (!row) return { ok: false, errors: { name: 'This class no longer exists' } };
    if (v.mainTeacherId) await tx.insert(classTeacher).values({ classId: row.id, teacherId: v.mainTeacherId }).onConflictDoNothing();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} class ${row.name}`, page: 'Classes', entity: 'school_class', entityId: row.id });
    return { ok: true, id: row.id };
  });
}

export async function deleteClass(db: Db, actor: Actor, id: number): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(classAssignment).where(eq(classAssignment.classId, id));
    if (n && n.n > 0) return { ok: false, error: 'This class has student history. Move its students out instead of deleting it.' };
    const [row] = await tx.delete(schoolClass).where(eq(schoolClass.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted class ${row.name}`, page: 'Classes', entity: 'school_class', entityId: id });
    return { ok: !!row };
  });
}

/** "Change order": moves a class one place up or down in its year's custom order, numbering the year 1, 2, 3… so gaps and ties go away. */
export async function moveClass(db: Db, actor: Actor, id: number, dir: 'up' | 'down') {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schoolClass).where(eq(schoolClass.id, id));
    if (!c) return false;
    const list = await tx.select({ id: schoolClass.id }).from(schoolClass).where(eq(schoolClass.academicYearId, c.academicYearId)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
    const i = list.findIndex((r) => r.id === id), j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j]!, list[i]!];
    for (const [n, r] of list.entries()) await tx.update(schoolClass).set({ sortOrder: n + 1 }).where(eq(schoolClass.id, r.id));
    await audit(tx, actor, { action: `Moved class ${c.name} ${dir}`, page: 'Classes', entity: 'school_class', entityId: id });
    return true;
  });
}

/** Classes for one year, with live student counts (no stored count, so nothing to drift). */
export const listClasses = (db: DbOrTx, yearId: number) => db.select({
  c: schoolClass, yearGroup: yearGroup.label, teacher: teacher.name,
  students: sql<number>`(select count(*)::int from class_assignment a join student s on s.id = a.student_id where a.class_id = "school_class"."id" and a.to_date is null)`
}).from(schoolClass).leftJoin(yearGroup, eq(yearGroup.id, schoolClass.yearGroupId)).leftJoin(teacher, eq(teacher.id, schoolClass.mainTeacherId))
  .where(eq(schoolClass.academicYearId, yearId)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));

export async function getClass(db: DbOrTx, id: number) {
  const [c] = await db.select().from(schoolClass).where(eq(schoolClass.id, id)).limit(1);
  if (!c) return null;
  const [teachers, students, slots] = await Promise.all([
    db.select({ ct: classTeacher, name: teacher.name }).from(classTeacher).innerJoin(teacher, eq(teacher.id, classTeacher.teacherId)).where(eq(classTeacher.classId, id)).orderBy(asc(teacher.name)),
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status, gender: student.gender, from: classAssignment.fromDate })
      .from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId)).where(and(eq(classAssignment.classId, id), isNull(classAssignment.toDate))).orderBy(asc(student.surname), asc(student.firstName)),
    slotsFor(db, { classId: id })
  ]);
  return { ...c, teachers, students, slots };
}

/* ───────── Class teachers and their portal privileges (§5 Class Teachers) ───────── */

export const PRIVILEGES = [['canRegister', 'Register'], ['canEoty', 'EOTY reports'], ['canMessage', 'Messaging'], ['canMerits', 'Merits'], ['canHomework', 'Homework'], ['canIncidents', 'Incidents']] as const;

export async function setClassTeacher(db: Db, actor: Actor, classId: number, teacherId: number, flags: Record<(typeof PRIVILEGES)[number][0], boolean> | null) {
  await db.transaction(async (tx) => {
    if (flags) await tx.insert(classTeacher).values({ classId, teacherId, ...flags }).onConflictDoUpdate({ target: [classTeacher.classId, classTeacher.teacherId], set: flags });
    else await tx.delete(classTeacher).where(and(eq(classTeacher.classId, classId), eq(classTeacher.teacherId, teacherId)));
    await audit(tx, actor, { action: flags ? 'Set a class teacher’s privileges' : 'Removed a teacher from a class', page: 'Class teachers', entity: 'class_teacher', entityId: `${classId}:${teacherId}`, details: flags ?? undefined });
  });
}

/* ───────── Students in classes ───────── */

export async function addStudentsToClass(db: Db, actor: Actor, classId: number, studentIds: number[], from = todayIso()) {
  await db.transaction(async (tx) => {
    for (const s of studentIds) await assignClass(tx, s, classId, from);
    await audit(tx, actor, { action: `Added ${studentIds.length === 1 ? '1 student' : `${studentIds.length} students`} to a class`, page: 'Class students', entity: 'school_class', entityId: classId, details: { studentIds, from } });
  });
}

export async function removeStudentsFromClass(db: Db, actor: Actor, classId: number, studentIds: number[], on = todayIso()) {
  await db.transaction(async (tx) => {
    await tx.update(classAssignment).set({ toDate: sql`greatest(${classAssignment.fromDate}, ${on}::date)` })
      .where(and(eq(classAssignment.classId, classId), inArray(classAssignment.studentId, studentIds), isNull(classAssignment.toDate)));
    await audit(tx, actor, { action: `Removed ${studentIds.length === 1 ? '1 student' : `${studentIds.length} students`} from a class`, page: 'Class students', entity: 'school_class', entityId: classId, details: { studentIds, on } });
  });
}

export const moveInput = z.object({ fromClassId: z.coerce.number().int().positive(), toClassId: z.coerce.number().int().positive('Choose the class to move to'), studentIds: idList, date: isoDate })
  .refine((v) => v.fromClassId !== v.toClassId, { path: ['toClassId'], message: 'Choose a different class' });

/** Move Students / Move Student Classes: close the old assignment the day before, open the new one on the date. */
export async function moveStudents(db: Db, actor: Actor, raw: unknown): Promise<{ ok: true; n: number } | { ok: false; errors: FieldErrors }> {
  const p = moveInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const dayBefore = sql`greatest(${classAssignment.fromDate}, ${v.date}::date - 1)`;
    const moved = await tx.update(classAssignment).set({ toDate: dayBefore })
      .where(and(eq(classAssignment.classId, v.fromClassId), inArray(classAssignment.studentId, v.studentIds), isNull(classAssignment.toDate))).returning({ s: classAssignment.studentId });
    for (const m of moved) await assignClass(tx, m.s, v.toClassId, v.date);
    await audit(tx, actor, { action: `Moved ${moved.length === 1 ? '1 student' : `${moved.length} students`} to another class`, page: 'Move students', entity: 'school_class', entityId: v.toClassId, details: { ...v } });
    return { ok: true as const, n: moved.length };
  });
}

/** Class history (§5 mode=class-assignments): add a past assignment by hand. */
export const historyInput = z.object({ studentId: z.coerce.number().int().positive(), classId: z.coerce.number().int().positive('Choose a class'), fromDate: isoDate, toDate: optionalIsoDate })
  .refine((v) => !v.toDate || v.toDate >= v.fromDate, { path: ['toDate'], message: 'To must be on or after From' });

export async function addHistory(db: Db, actor: Actor, raw: unknown): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const p = historyInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  return db.transaction(async (tx) => {
    const ins = await tx.insert(classAssignment).values(p.data).onConflictDoNothing().returning();
    if (!ins.length) throw new FieldFail({ classId: 'The student is already in this class' });
    await audit(tx, actor, { action: 'Added a class history entry', page: 'Class history', entity: 'student', entityId: p.data.studentId, details: p.data });
    return { ok: true as const };
  }).catch(catchFieldFail);
}

export async function deleteHistory(db: Db, actor: Actor, assignmentId: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(classAssignment).where(eq(classAssignment.id, assignmentId)).returning();
    if (row) await audit(tx, actor, { action: 'Deleted a class history entry', page: 'Class history', entity: 'student', entityId: row.studentId, details: { classId: row.classId, from: row.fromDate, to: row.toDate } });
  });
}

/* ───────── Timetables (§5 Timetable, templates, duplicate timings) ───────── */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time such as 17:00');
export const slotInput = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: hhmm,
  hours: z.coerce.number().int().min(0).max(12).default(0),
  minutes: z.coerce.number().int().min(0).max(59).default(0),
  teacherId: optId, classroomId: optId, subjectId: optId,
  takesRegister: checkbox
}).refine((v) => v.hours * 60 + v.minutes > 0, { path: ['minutes'], message: 'Add how long the session lasts' });

export const slotsFor = (db: DbOrTx, owner: { classId: number } | { templateId: number }) => db.select({
  s: timetableSlot, teacher: teacher.name, room: classroom.name, subject: subject.name
}).from(timetableSlot).leftJoin(teacher, eq(teacher.id, timetableSlot.teacherId)).leftJoin(classroom, eq(classroom.id, timetableSlot.classroomId)).leftJoin(subject, eq(subject.id, timetableSlot.subjectId))
  .where('classId' in owner ? eq(timetableSlot.classId, owner.classId) : eq(timetableSlot.templateId, owner.templateId))
  .orderBy(asc(timetableSlot.weekday), asc(timetableSlot.startTime));

export async function addSlot(db: Db, actor: Actor, owner: { classId: number } | { templateId: number }, raw: unknown): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const p = slotInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const { hours, minutes, ...v } = p.data;
  await db.transaction(async (tx) => {
    await tx.insert(timetableSlot).values({ ...v, ...owner, durationMinutes: hours * 60 + minutes });
    await audit(tx, actor, { action: 'Added a timetable session', page: 'Timetable', entity: 'timetable_slot', details: { ...owner, weekday: v.weekday, start: v.startTime } });
  });
  return { ok: true };
}

export async function deleteSlot(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(timetableSlot).where(eq(timetableSlot.id, id)).returning();
    if (row) await audit(tx, actor, { action: 'Removed a timetable session', page: 'Timetable', entity: 'timetable_slot', entityId: id });
  });
}

/** Copies sessions from a class or template into target classes, replacing their timetables. */
export async function copyTimings(db: Db, actor: Actor, from: { classId: number } | { templateId: number }, targetClassIds: number[]) {
  return db.transaction(async (tx) => {
    const src = await tx.select().from(timetableSlot).where('classId' in from ? eq(timetableSlot.classId, from.classId) : eq(timetableSlot.templateId, from.templateId));
    await tx.delete(timetableSlot).where(inArray(timetableSlot.classId, targetClassIds));
    const rows = targetClassIds.flatMap((classId) => src.map(({ id: _id, templateId: _t, classId: _c, ...s }) => ({ ...s, classId, templateId: null })));
    if (rows.length) await tx.insert(timetableSlot).values(rows);
    await audit(tx, actor, { action: `Copied ${src.length === 1 ? '1 session' : `${src.length} sessions`} to ${targetClassIds.length === 1 ? '1 class' : `${targetClassIds.length} classes`}`, page: 'Timetable', entity: 'timetable_slot', details: { from, targetClassIds } });
    return src.length;
  });
}

export const listTemplates = (db: DbOrTx) => db.select({ t: timetableTemplate, n: sql<number>`(select count(*)::int from timetable_slot s where s.template_id = "timetable_template"."id")` })
  .from(timetableTemplate).orderBy(asc(timetableTemplate.name));

export async function saveTemplate(db: Db, actor: Actor, name: string, id?: number) {
  const n = z.string().trim().min(1).max(80).safeParse(name);
  if (!n.success) return { ok: false as const, error: 'Add a template name' };
  return db.transaction(async (tx) => {
    const [row] = id ? await tx.update(timetableTemplate).set({ name: n.data }).where(eq(timetableTemplate.id, id)).returning() : await tx.insert(timetableTemplate).values({ name: n.data }).returning();
    await audit(tx, actor, { action: `${id ? 'Renamed' : 'Added'} timetable template ${n.data}`, page: 'Timetable templates', entity: 'timetable_template', entityId: row!.id });
    return { ok: true as const, id: row!.id };
  });
}

export async function deleteTemplate(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(timetableTemplate).where(eq(timetableTemplate.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted timetable template ${row.name}`, page: 'Timetable templates', entity: 'timetable_template', entityId: id });
  });
}

/* ───────── Rooms and subjects ───────── */

export const listRooms = (db: DbOrTx) => db.select().from(classroom).orderBy(asc(classroom.name));
export const listSubjects = (db: DbOrTx) => db.select().from(subject).orderBy(asc(subject.name));

export async function saveRoom(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = z.object({ name: z.string().trim().min(1, 'Add a name').max(80), location: optionalText(200) }).safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  await db.transaction(async (tx) => {
    const [row] = id ? await tx.update(classroom).set(p.data).where(eq(classroom.id, id)).returning() : await tx.insert(classroom).values(p.data).returning();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} classroom ${row!.name}`, page: 'Classrooms', entity: 'classroom', entityId: row!.id });
  });
  return { ok: true as const };
}

export async function saveSubject(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = z.object({ name: z.string().trim().min(1, 'Add a name').max(80), description: optionalText(500) }).safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  return db.transaction(async (tx) => {
    const clash = await tx.select({ id: subject.id }).from(subject).where(and(sql`lower(${subject.name}) = lower(${p.data.name})`, id ? ne(subject.id, id) : undefined)).limit(1);
    if (clash[0]) return { ok: false as const, errors: { name: 'That subject already exists' } };
    const [row] = id ? await tx.update(subject).set(p.data).where(eq(subject.id, id)).returning() : await tx.insert(subject).values(p.data).returning();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} subject ${row!.name}`, page: 'Subjects', entity: 'subject', entityId: row!.id });
    return { ok: true as const };
  });
}

export async function deleteNamed(db: Db, actor: Actor, kind: 'classroom' | 'subject', id: number) {
  const table = kind === 'classroom' ? classroom : subject;
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(table).where(eq(table.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted ${kind} ${row.name}`, page: kind === 'classroom' ? 'Classrooms' : 'Subjects', entity: kind, entityId: id });
  });
}

/* ───────── Maintenance and year roll-over ───────── */

/** Problems the §5 maintenance tools fix: open assignments for students who have left, and open assignments in classes of finished years. */
export async function maintenanceReport(db: DbOrTx) {
  const leftOpen = await db.execute<{ id: number; student: string; class: string; left_date: string }>(sql`
    select a.id, s.first_name || ' ' || s.surname as student, c.name as class, s.left_date::text
    from class_assignment a join student s on s.id = a.student_id join school_class c on c.id = a.class_id
    where a.to_date is null and s.status in ('Relocated/Left', 'Finished', 'Expelled', 'Deceased', 'Rejected') order by 2`);
  const oldYearOpen = await db.execute<{ id: number; student: string; class: string; year: string; ends_on: string }>(sql`
    select a.id, s.first_name || ' ' || s.surname as student, c.name as class, y.title as year, y.ends_on::text
    from class_assignment a join student s on s.id = a.student_id join school_class c on c.id = a.class_id join academic_year y on y.id = c.academic_year_id
    where a.to_date is null and y.ends_on < ${todayIso()}::date order by 4, 2`);
  return { leftOpen, oldYearOpen };
}

export async function fixMaintenance(db: Db, actor: Actor) {
  return db.transaction(async (tx) => {
    const a = await tx.execute(sql`update class_assignment a set to_date = greatest(a.from_date, coalesce(s.left_date, current_date))
      from student s where s.id = a.student_id and a.to_date is null and s.status in ('Relocated/Left', 'Finished', 'Expelled', 'Deceased', 'Rejected')`);
    const b = await tx.execute(sql`update class_assignment a set to_date = greatest(a.from_date, y.ends_on)
      from school_class c join academic_year y on y.id = c.academic_year_id where c.id = a.class_id and a.to_date is null and y.ends_on < ${todayIso()}::date`);
    const n = (a.count ?? 0) + (b.count ?? 0);
    await audit(tx, actor, { action: `Fixed class history (${n === 1 ? '1 entry' : `${n} entries`})`, page: 'Class maintenance', entity: 'class_assignment' });
    return n;
  });
}

/** New Year Wizard: copy classes (optionally with timetables and teachers) from one year into another. */
export async function copyClassesToYear(db: Db, actor: Actor, fromYearId: number, toYearId: number, opts: { timings: boolean; teachers: boolean }) {
  return db.transaction(async (tx) => {
    const [to] = await tx.select().from(academicYear).where(eq(academicYear.id, toYearId)).limit(1);
    if (!to) throw new FieldFail({ toYearId: 'Choose the new year' });
    const src = await tx.select().from(schoolClass).where(eq(schoolClass.academicYearId, fromYearId));
    const existing = new Set((await tx.select({ name: schoolClass.name }).from(schoolClass).where(eq(schoolClass.academicYearId, toYearId))).map((r) => r.name.toLowerCase()));
    let n = 0;
    for (const c of src) {
      if (existing.has(c.name.toLowerCase())) continue;
      const { id: oldId, createdAt: _c, ...rest } = c;
      const [nc] = await tx.insert(schoolClass).values({ ...rest, academicYearId: toYearId, startsOn: to.startsOn, endsOn: to.endsOn }).returning();
      n++;
      if (opts.teachers) {
        const ts = await tx.select().from(classTeacher).where(eq(classTeacher.classId, oldId));
        if (ts.length) await tx.insert(classTeacher).values(ts.map((t) => ({ ...t, classId: nc!.id })));
      } else await tx.update(schoolClass).set({ mainTeacherId: null }).where(eq(schoolClass.id, nc!.id));
      if (opts.timings) {
        const slots = await tx.select().from(timetableSlot).where(eq(timetableSlot.classId, oldId));
        if (slots.length) await tx.insert(timetableSlot).values(slots.map(({ id: _i, ...s }) => ({ ...s, classId: nc!.id, ...(opts.teachers ? {} : { teacherId: null }) })));
      }
    }
    await audit(tx, actor, { action: `Copied ${n === 1 ? '1 class' : `${n} classes`} into ${to.title}`, page: 'New year wizard', entity: 'academic_year', entityId: toYearId, details: { fromYearId, ...opts } });
    return n;
  }).catch((e) => { if (e instanceof FieldFail) return 0; throw e; });
}

/**
 * New Year Wizard: move current students from each old class to its mapped new class on the new year's start date.
 * mapping: old class id → new class id (or null to leave the student without a class).
 */
export async function migrateStudents(db: Db, actor: Actor, fromYearId: number, toYearId: number, mapping: Record<number, number | null>) {
  return db.transaction(async (tx) => {
    const [from] = await tx.select().from(academicYear).where(eq(academicYear.id, fromYearId)).limit(1);
    const [to] = await tx.select().from(academicYear).where(eq(academicYear.id, toYearId)).limit(1);
    if (!from || !to) return 0;
    const newClasses = new Set((await tx.select({ id: schoolClass.id }).from(schoolClass).where(eq(schoolClass.academicYearId, toYearId))).map((r) => r.id));
    let n = 0;
    for (const [oldId, newId] of Object.entries(mapping)) {
      if (newId !== null && !newClasses.has(newId)) continue;
      const open = await tx.select({ studentId: classAssignment.studentId }).from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId))
        .where(and(eq(classAssignment.classId, Number(oldId)), isNull(classAssignment.toDate), eq(student.status, 'Current')));
      if (!open.length) continue;
      const ids = open.map((o) => o.studentId);
      await tx.update(classAssignment).set({ toDate: sql`greatest(${classAssignment.fromDate}, ${from.endsOn}::date)` })
        .where(and(eq(classAssignment.classId, Number(oldId)), inArray(classAssignment.studentId, ids), isNull(classAssignment.toDate)));
      if (newId !== null) for (const s of ids) await assignClass(tx, s, newId, to.startsOn);
      n += ids.length;
    }
    await audit(tx, actor, { action: `Moved ${n === 1 ? '1 student' : `${n} students`} into ${to.title} classes`, page: 'New year wizard', entity: 'academic_year', entityId: toYearId, details: { fromYearId, mapping } });
    return n;
  });
}

