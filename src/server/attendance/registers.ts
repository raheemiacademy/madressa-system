import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import {
  absenceNotice, attendanceCode, attendanceMark, classAssignment, holiday, holidayClass, MARKS, registerSession, schoolClass, student, timetableSlot
} from '@/db/schema';
import { classify, letter, summarise, type CodeInfo } from '@/lib/attendance';
import { isoDate } from '@/lib/validate';
import { audit } from '../audit';
import { readTab } from '../settings';
import type { Actor } from '../people/common';

/** ISO weekday (1 = Monday) of a YYYY-MM-DD date. */
export const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

export async function codeMap(db: DbOrTx): Promise<Record<string, CodeInfo & { description: string }>> {
  const rows = await db.select().from(attendanceCode).where(eq(attendanceCode.active, true)).orderBy(asc(attendanceCode.sortOrder));
  return Object.fromEntries(rows.map((r) => [r.code, { type: r.type, isLate: r.isLate, description: r.description }]));
}
export const registerMode = async (db: DbOrTx) => ((await readTab(db, 'register')).type === 'dfe' ? 'dfe' : 'classic') as 'classic' | 'dfe';

/** Why a class has no register on a date: a holiday ("H") or a non-school day ("C"), else null. */
export async function closures(db: DbOrTx, classIds: number[], from: string, to: string) {
  const days = ((await readTab(db, 'schoolDays')).days as string[]).map(Number);
  const hols = await db.select({ h: holiday, classId: holidayClass.classId }).from(holiday).leftJoin(holidayClass, eq(holidayClass.holidayId, holiday.id))
    .where(and(lte(holiday.startsOn, to), gte(holiday.endsOn, from), eq(holiday.studentsAttend, false)));
  return (classId: number, date: string): { kind: 'H' | 'C'; title: string } | null => {
    const h = hols.find((x) => date >= x.h.startsOn && date <= x.h.endsOn && (x.h.allClasses || x.classId === classId));
    if (h) return { kind: 'H', title: h.h.title };
    if (!days.includes(weekdayOf(date))) return { kind: 'C', title: 'Not a school day' };
    return null;
  };
}

/** Timetable sessions that take a register for a class on a date (none on holidays or closed days). */
export async function expectedSessions(db: DbOrTx, classId: number, date: string) {
  const closed = (await closures(db, [classId], date, date))(classId, date);
  if (closed) return [];
  return db.select({ id: timetableSlot.id, startTime: timetableSlot.startTime, durationMinutes: timetableSlot.durationMinutes, subjectId: timetableSlot.subjectId })
    .from(timetableSlot).where(and(eq(timetableSlot.classId, classId), eq(timetableSlot.weekday, weekdayOf(date)), eq(timetableSlot.takesRegister, true)))
    .orderBy(asc(timetableSlot.startTime));
}

/** Students in a class on a date, ordered by the Register setting (first name or surname). */
export async function classStudentsOn(db: DbOrTx, classId: number, date: string) {
  const bySurname = (await readTab(db, 'register')).orderBy === 'surname';
  return db.select({ id: student.id, firstName: student.firstName, surname: student.surname, hasMedical: student.hasMedical }).from(classAssignment)
    .innerJoin(student, eq(student.id, classAssignment.studentId))
    .where(and(eq(classAssignment.classId, classId), lte(classAssignment.fromDate, date), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, date))))
    .orderBy(...(bySurname ? [asc(student.surname), asc(student.firstName)] : [asc(student.firstName), asc(student.surname)]));
}

/** One register (class, date, start time): students, their marks if taken, and parents' notices for the day. */
export async function getRegister(db: DbOrTx, classId: number, date: string, startTime: string) {
  const [students, [session], notices] = await Promise.all([
    classStudentsOn(db, classId, date),
    db.select().from(registerSession).where(and(eq(registerSession.classId, classId), eq(registerSession.date, date), eq(registerSession.startTime, startTime))),
    db.select().from(absenceNotice).where(eq(absenceNotice.date, date))
  ]);
  const marks = session ? await db.select().from(attendanceMark).where(eq(attendanceMark.sessionId, session.id)) : [];
  return {
    session: session ?? null,
    rows: students.map((s) => ({ ...s, mark: marks.find((m) => m.studentId === s.id) ?? null, notice: notices.find((n) => n.studentId === s.id) ?? null }))
  };
}

const minutes = z.union([z.literal(''), z.coerce.number().int().min(0).max(600)]).optional().transform((v) => (typeof v === 'number' ? v : null));
export const markInput = z.object({
  studentId: z.coerce.number().int().positive(),
  mark: z.enum(MARKS),
  code: z.string().max(3).optional().transform((v) => v || null),
  authorised: z.union([z.literal('yes'), z.literal('no'), z.literal(''), z.boolean(), z.null()]).optional().transform((v) => (v === 'yes' || v === true ? true : v === 'no' || v === false ? false : null)),
  notified: z.union([z.boolean(), z.literal('on'), z.literal('')]).optional().transform((v) => v === true || v === 'on'),
  lateMinutes: minutes, leftEarlyMinutes: minutes,
  note: z.string().trim().max(500).optional().transform((v) => v || null)
});
export const registerInput = z.object({
  classId: z.coerce.number().int().positive(), date: isoDate,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/),
  marks: z.array(markInput).max(500)
});
export type RegisterInput = z.input<typeof registerInput>;

/**
 * Saves a register. Only students in the class on that date can be marked; in DfE mode every mark needs an active code.
 * Re-saving updates marks in place (one row per student per session).
 */
export async function saveRegister(db: Db, actor: Actor, raw: unknown): Promise<{ ok: true; sessionId: number } | { ok: false; error: string }> {
  const p = registerInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the register' };
  const v = p.data;
  const [cls] = await db.select().from(schoolClass).where(eq(schoolClass.id, v.classId)).limit(1);
  if (!cls) return { ok: false, error: 'That class no longer exists.' };
  const allowed = new Set((await classStudentsOn(db, v.classId, v.date)).map((s) => s.id));
  const stranger = v.marks.find((m) => !allowed.has(m.studentId));
  if (stranger) return { ok: false, error: 'A student on this register isn’t in the class on that date.' };
  if (new Set(v.marks.map((m) => m.studentId)).size !== v.marks.length) return { ok: false, error: 'A student appears twice.' };
  const mode = await registerMode(db);
  const codes = await codeMap(db);
  for (const m of v.marks) {
    if (mode === 'dfe' && (!m.code || !codes[m.code])) return { ok: false, error: 'Choose an attendance code for every student.' };
    if (mode === 'classic') m.code = null;
  }
  return db.transaction(async (tx) => {
    const startTime = v.startTime.slice(0, 5);
    const [slot] = await tx.select({ id: timetableSlot.id }).from(timetableSlot)
      .where(and(eq(timetableSlot.classId, v.classId), eq(timetableSlot.weekday, weekdayOf(v.date)), sql`${timetableSlot.startTime} = ${startTime}::time`)).limit(1);
    const [session] = await tx.insert(registerSession).values({ classId: v.classId, date: v.date, startTime, slotId: slot?.id ?? null, takenBy: actor.identityId, takenAt: new Date() })
      .onConflictDoUpdate({ target: [registerSession.classId, registerSession.date, registerSession.startTime], set: { takenBy: actor.identityId, takenAt: new Date() } }).returning();
    for (const m of v.marks) {
      const values = { mark: m.mark, code: m.code, authorised: m.mark === 'absent' || m.mark === 'late' ? m.authorised : null, notified: m.notified, lateMinutes: m.mark === 'late' ? m.lateMinutes : null, leftEarlyMinutes: m.mark === 'left_early' ? m.leftEarlyMinutes : null, note: m.note, updatedBy: actor.identityId, updatedAt: new Date() };
      await tx.insert(attendanceMark).values({ sessionId: session!.id, studentId: m.studentId, ...values })
        .onConflictDoUpdate({ target: [attendanceMark.sessionId, attendanceMark.studentId], set: values });
    }
    const s = summarise(v.marks.map((m) => ({ ...m, code: m.code ?? undefined })), codes);
    await audit(tx, actor, { action: `Took the ${cls.name} register for ${v.date} ${startTime} (${s.present + s.late} in, ${s.absent} absent)`, page: 'Register', entity: 'register_session', entityId: session!.id });
    return { ok: true as const, sessionId: session!.id };
  });
}

export const decisionInput = z.object({
  markIds: z.array(z.coerce.number().int().positive()).min(1, 'Tick at least one entry').max(2000),
  authorised: z.enum(['yes', 'no', 'keep']).default('keep'),
  notified: z.enum(['yes', 'no', 'keep']).default('keep'),
  note: z.string().trim().max(500).optional().transform((v) => v || undefined)
});

/** Mass Authorise, Multiple Validations and the grid's absence menu: set authorised / notified / note on marks. */
export async function decideMarks(db: Db, actor: Actor, raw: unknown) {
  const p = decisionInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the choices' };
  const v = p.data;
  const set = { ...(v.authorised !== 'keep' ? { authorised: v.authorised === 'yes' } : {}), ...(v.notified !== 'keep' ? { notified: v.notified === 'yes' } : {}), ...(v.note !== undefined ? { note: v.note } : {}) };
  if (!Object.keys(set).length) return { ok: false as const, error: 'Choose something to change' };
  return db.transaction(async (tx) => {
    // Authorisation only applies to absences and lates.
    const rows = await tx.update(attendanceMark).set({ ...set, updatedBy: actor.identityId, updatedAt: new Date() })
      .where(and(inArray(attendanceMark.id, v.markIds), inArray(attendanceMark.mark, ['absent', 'late']))).returning({ id: attendanceMark.id });
    await audit(tx, actor, { action: `Updated ${rows.length === 1 ? '1 absence or late' : `${rows.length} absences and lates`}${v.authorised !== 'keep' ? ` (${v.authorised === 'yes' ? 'authorised' : 'unauthorised'})` : ''}`, page: 'Mass authorise', entity: 'attendance_mark', details: { ids: rows.map((r) => r.id), ...set } });
    return { ok: true as const, n: rows.length };
  });
}

export const markAbsentInput = z.object({
  studentId: z.coerce.number().int().positive('Choose a student'),
  from: isoDate, to: isoDate,
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).default([]),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
  notified: z.union([z.literal('on'), z.literal(''), z.boolean()]).optional().transform((v) => v === 'on' || v === true),
  authorised: z.enum(['yes', 'no', '']).default('').transform((v) => (v === 'yes' ? true : v === 'no' ? false : null))
}).refine((v) => v.to >= v.from, { path: ['to'], message: 'The end date can’t be before the start' })
  .refine((v) => datesBetween(v.from, v.to).length <= 366, { path: ['to'], message: 'Choose a year or less' });

/** "Mark Students Absent" → "Complete Registers": absent marks on every expected session in the range (optionally only some weekdays). */
export async function markAbsent(db: Db, actor: Actor, raw: unknown): Promise<{ ok: true; n: number } | { ok: false; errors: Record<string, string> }> {
  const p = markAbsentInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const v = p.data;
  const mode = await registerMode(db);
  const code = mode === 'dfe' ? (v.authorised === true ? 'C' : v.authorised === false ? 'O' : 'N') : null;
  return db.transaction(async (tx) => {
    const assigns = await tx.select().from(classAssignment).where(and(eq(classAssignment.studentId, v.studentId), lte(classAssignment.fromDate, v.to), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, v.from))));
    let n = 0;
    for (const date of datesBetween(v.from, v.to)) {
      if (v.weekdays.length && !v.weekdays.includes(weekdayOf(date))) continue;
      for (const a of assigns.filter((x) => x.fromDate <= date && (!x.toDate || x.toDate >= date))) {
        for (const slot of await expectedSessions(tx, a.classId, date)) {
          const [s] = await tx.insert(registerSession).values({ classId: a.classId, date, startTime: slot.startTime.slice(0, 5), slotId: slot.id })
            .onConflictDoUpdate({ target: [registerSession.classId, registerSession.date, registerSession.startTime], set: { slotId: slot.id } }).returning();
          const values = { mark: 'absent' as const, code, authorised: v.authorised, notified: v.notified, note: v.note, updatedBy: actor.identityId, updatedAt: new Date() };
          await tx.insert(attendanceMark).values({ sessionId: s!.id, studentId: v.studentId, ...values }).onConflictDoUpdate({ target: [attendanceMark.sessionId, attendanceMark.studentId], set: values });
          n++;
        }
      }
    }
    await audit(tx, actor, { action: `Marked a student absent for ${n === 1 ? '1 session' : `${n} sessions`} (${v.from} to ${v.to})`, page: 'Mark students absent', entity: 'student', entityId: v.studentId });
    return { ok: true as const, n };
  });
}

export const deleteEntriesInput = z.object({
  from: isoDate, to: isoDate,
  classId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (typeof v === 'number' ? v : null)),
  studentIds: z.array(z.coerce.number().int().positive()).default([])
}).refine((v) => v.to >= v.from, { path: ['to'], message: 'The end date can’t be before the start' })
  .refine((v) => v.classId || v.studentIds.length, { path: ['classId'], message: 'Choose a class or students' });

/** Delete register entries (typed school name checked by the caller). Empty sessions go too. */
export async function deleteEntries(db: Db, actor: Actor, raw: unknown) {
  const p = deleteEntriesInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const sessions = tx.select({ id: registerSession.id }).from(registerSession)
      .where(and(gte(registerSession.date, v.from), lte(registerSession.date, v.to), v.classId ? eq(registerSession.classId, v.classId) : undefined));
    const gone = await tx.delete(attendanceMark).where(and(inArray(attendanceMark.sessionId, sessions), v.studentIds.length ? inArray(attendanceMark.studentId, v.studentIds) : undefined)).returning({ id: attendanceMark.id });
    await tx.execute(sql`delete from register_session s where s.date between ${v.from} and ${v.to} and not exists (select 1 from attendance_mark m where m.session_id = s.id)`);
    await audit(tx, actor, { action: `Deleted ${gone.length === 1 ? '1 register entry' : `${gone.length} register entries`} (${v.from} to ${v.to})`, page: 'Delete register entries', entity: 'attendance_mark', details: { classId: v.classId, studentIds: v.studentIds } });
    return { ok: true as const, n: gone.length };
  });
}

/* ───────── Reads for grids, records and dashboards ───────── */

type MarkRow = { id: number; sessionId: number; studentId: number; date: string; startTime: string; classId: number; mark: (typeof MARKS)[number]; code: string | null; authorised: boolean | null; notified: boolean; lateMinutes: number | null; leftEarlyMinutes: number | null; note: string | null };

export const marksBetween = (db: DbOrTx, from: string, to: string, f: { classId?: number; studentId?: number; studentIds?: number[] } = {}) => db.select({
  id: attendanceMark.id, sessionId: attendanceMark.sessionId, studentId: attendanceMark.studentId, date: registerSession.date, startTime: registerSession.startTime, classId: registerSession.classId,
  mark: attendanceMark.mark, code: attendanceMark.code, authorised: attendanceMark.authorised, notified: attendanceMark.notified, lateMinutes: attendanceMark.lateMinutes, leftEarlyMinutes: attendanceMark.leftEarlyMinutes, note: attendanceMark.note
}).from(attendanceMark).innerJoin(registerSession, eq(registerSession.id, attendanceMark.sessionId))
  .where(and(gte(registerSession.date, from), lte(registerSession.date, to), f.classId ? eq(registerSession.classId, f.classId) : undefined,
    f.studentId ? eq(attendanceMark.studentId, f.studentId) : undefined, f.studentIds?.length ? inArray(attendanceMark.studentId, f.studentIds) : undefined))
  .orderBy(asc(registerSession.date), asc(registerSession.startTime)) as Promise<MarkRow[]>;

/** Daily Register grid: students × register days of a month for one class, with the % per student and validation list. */
export async function monthGrid(db: DbOrTx, classId: number, month: string) {
  const { from, to } = monthRange(month);
  const [students, marks, slots, codes, closed] = await Promise.all([
    db.selectDistinct({ id: student.id, firstName: student.firstName, surname: student.surname }).from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId))
      .where(and(eq(classAssignment.classId, classId), lte(classAssignment.fromDate, to), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, from)))).orderBy(asc(student.surname), asc(student.firstName)),
    marksBetween(db, from, to, { classId }),
    db.select({ weekday: timetableSlot.weekday }).from(timetableSlot).where(and(eq(timetableSlot.classId, classId), eq(timetableSlot.takesRegister, true))),
    codeMap(db), closures(db, [classId], from, to)
  ]);
  const regDays = new Set(slots.map((s) => s.weekday));
  const days = datesBetween(from, to).filter((d) => regDays.has(weekdayOf(d)) || marks.some((m) => m.date === d)).map((d) => ({ date: d, closed: closed(classId, d) }));
  return {
    days, codes,
    rows: students.map((s) => {
      const mine = marks.filter((m) => m.studentId === s.id);
      return {
        ...s,
        cells: Object.fromEntries(days.map((d) => [d.date, mine.filter((m) => m.date === d.date).map((m) => ({ id: m.id, letter: letter(m, codes), mark: m.mark, authorised: m.authorised, notified: m.notified, note: m.note, lateMinutes: m.lateMinutes }))])),
        summary: summarise(mine, codes)
      };
    }),
    // Multiple Validations: absences and lates with no authorisation decision yet.
    unvalidated: marks.filter((m) => { const c = classify(m, codes); return (c.absent || c.late) && m.authorised === null && !m.code; })
      .map((m) => ({ ...m, name: students.find((s) => s.id === m.studentId) })).filter((m) => m.name)
  };
}

/** Per-student totals between two dates, optionally for one class. Used by stats, alerts and the student record. */
export async function studentSummaries(db: DbOrTx, from: string, to: string, classId?: number) {
  const [marks, codes] = await Promise.all([marksBetween(db, from, to, { classId }), codeMap(db)]);
  const by = new Map<number, MarkRow[]>();
  for (const m of marks) by.set(m.studentId, [...(by.get(m.studentId) ?? []), m]);
  return { codes, summaries: [...by].map(([studentId, ms]) => ({ studentId, summary: summarise(ms, codes) })) };
}

/** Today's registers card: each class with its expected sessions and how many have been taken. */
export async function registerStatus(db: DbOrTx, yearId: number, date: string) {
  const classes = await db.select().from(schoolClass).where(eq(schoolClass.academicYearId, yearId)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
  const taken = await db.select({ classId: registerSession.classId, startTime: registerSession.startTime }).from(registerSession).where(and(eq(registerSession.date, date), sql`${registerSession.takenAt} is not null`));
  const out = [];
  for (const c of classes) {
    const exp = await expectedSessions(db, c.id, date);
    const done = exp.filter((s) => taken.some((t) => t.classId === c.id && t.startTime.slice(0, 5) === s.startTime.slice(0, 5))).length;
    out.push({ classId: c.id, name: c.name, expected: exp.length, taken: done, status: exp.length === 0 ? 'No register' : done === exp.length ? 'Complete' : done ? 'Incomplete' : 'Not taken', sessions: exp });
  }
  return out;
}

/** Whole-school weekly trend: share of counted marks that were present or late, per ISO week (Monday). */
export async function weeklyTrend(db: DbOrTx, from: string, to: string) {
  const [marks, codes] = await Promise.all([marksBetween(db, from, to), codeMap(db)]);
  const weeks = new Map<string, MarkRow[]>();
  for (const m of marks) { const wk = addDays(m.date, 1 - weekdayOf(m.date)); weeks.set(wk, [...(weeks.get(wk) ?? []), m]); }
  return [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, ms]) => ({ week, rate: summarise(ms, codes).standardPct })).filter((w) => w.rate !== null) as { week: string; rate: number }[];
}
