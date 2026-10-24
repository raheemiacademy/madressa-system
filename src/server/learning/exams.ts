import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { exam, examResult, examTest, gradeBand, gradeSystem, quiz, schoolClass, semester, subject, teacher } from '@/db/schema';
import { isoDate, zodErrors } from '@/lib/validate';
import { ukLocal } from '@/lib/dates';
import { audit } from '../audit';
import { classStudentsOn } from '../attendance/registers';
import type { Actor } from '../people/common';

/* ───────── Grades ───────── */

/** "Load standard grades": a common UK-style scale. */
export const STANDARD_GRADES: [number, string][] = [[90, 'A*'], [80, 'A'], [70, 'B'], [60, 'C'], [50, 'D'], [40, 'E'], [0, 'U']];

export const gradeFor = (pct: number | null, bands: { minPct: number; grade: string }[]) =>
  pct === null ? '' : [...bands].sort((a, b) => b.minPct - a.minPct).find((b) => pct >= b.minPct)?.grade ?? '';

export async function listGradeSystems(db: DbOrTx) {
  const [systems, bands] = await Promise.all([db.select().from(gradeSystem).orderBy(asc(gradeSystem.name)), db.select().from(gradeBand).orderBy(desc(gradeBand.minPct))]);
  return systems.map((s) => ({ ...s, bands: bands.filter((b) => b.systemId === s.id) }));
}

export const gradeSystemInput = z.object({
  name: z.string().trim().min(1, 'Name the grading system').max(60),
  isDefault: z.boolean().default(false),
  bands: z.array(z.object({ minPct: z.coerce.number().int().min(0).max(100), grade: z.string().trim().min(1).max(10) })).min(1, 'Add at least one grade').max(30)
}).refine((v) => new Set(v.bands.map((b) => b.minPct)).size === v.bands.length, { path: ['bands'], message: 'Each percentage can only be used once' })
  .refine((v) => v.bands.some((b) => b.minPct === 0), { path: ['bands'], message: 'Include a grade starting at 0%' });

export async function saveGradeSystem(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = gradeSystemInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const [clash] = await tx.select({ id: gradeSystem.id }).from(gradeSystem).where(sql`lower(${gradeSystem.name}) = ${v.name.toLowerCase()}`);
    if (clash && clash.id !== id) return { ok: false as const, errors: { name: 'Another grading system has this name' } };
    if (v.isDefault) await tx.update(gradeSystem).set({ isDefault: false });
    const sid = id ? (await tx.update(gradeSystem).set({ name: v.name, isDefault: v.isDefault }).where(eq(gradeSystem.id, id)).returning())[0]?.id
      : (await tx.insert(gradeSystem).values({ name: v.name, isDefault: v.isDefault }).returning())[0]!.id;
    if (!sid) return { ok: false as const, errors: { name: 'This grading system no longer exists' } };
    await tx.delete(gradeBand).where(eq(gradeBand.systemId, sid));
    await tx.insert(gradeBand).values(v.bands.map((b) => ({ systemId: sid, ...b })));
    await audit(tx, actor, { action: `Saved grading system “${v.name}”`, page: 'Grades', entity: 'grade_system', entityId: sid });
    return { ok: true as const, id: sid };
  });
}

/* ───────── Exams and tests ───────── */

export const examInput = z.object({
  classId: z.coerce.number().int().positive('Choose a class'),
  official: z.enum(['official', 'progressive']).transform((v) => v === 'official'),
  title: z.string().trim().min(1, 'Give the exam a title').max(120),
  date: isoDate,
  gradeSystemId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null))
});

export async function saveExam(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = examInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx): Promise<{ ok: true; id: number } | { ok: false; errors: Record<string, string> }> => {
    const [c] = await tx.select().from(schoolClass).where(eq(schoolClass.id, v.classId));
    if (!c) return { ok: false as const, errors: { classId: 'Choose a class' } };
    if (id) {
      const [cur] = await tx.select().from(exam).where(eq(exam.id, id));
      if (!cur) return { ok: false as const, errors: { title: 'This exam no longer exists' } };
      if (cur.status === 'locked') return { ok: false as const, errors: { title: 'This exam is locked' } };
    }
    const values = { ...v, academicYearId: c.academicYearId };
    const [row] = id ? await tx.update(exam).set(values).where(eq(exam.id, id)).returning() : await tx.insert(exam).values({ ...values, createdBy: actor.identityId }).returning();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} ${v.official ? 'exam' : 'progressive test'} “${v.title}” for ${c.name}`, page: 'Exams', entity: 'exam', entityId: row!.id });
    return { ok: true as const, id: row!.id };
  });
}

export type ExamFilter = { status?: string; official?: boolean; classId?: number; byTeacher?: boolean; yearId?: number };
export const listExams = (db: DbOrTx, f: ExamFilter = {}) => {
  const conds: (SQL | undefined)[] = [f.status ? eq(exam.status, f.status) : undefined, f.official === undefined ? undefined : eq(exam.official, f.official),
    f.classId ? eq(exam.classId, f.classId) : undefined, f.byTeacher === undefined ? undefined : eq(exam.addedByTeacher, f.byTeacher), f.yearId ? eq(exam.academicYearId, f.yearId) : undefined];
  return db.select({ e: exam, className: schoolClass.name, tests: sql<number>`(select count(*) from exam_test t where t.exam_id = "exam"."id")`.mapWith(Number) })
    .from(exam).innerJoin(schoolClass, eq(schoolClass.id, exam.classId)).where(and(...conds)).orderBy(desc(exam.date), asc(schoolClass.name)).limit(500);
};

export async function setExamStatus(db: Db, actor: Actor, id: number, status: 'open' | 'closed' | 'locked') {
  const [e] = await db.update(exam).set({ status }).where(eq(exam.id, id)).returning();
  if (e) await audit(db, actor, { action: `Set exam “${e.title}” to ${status}`, page: 'Exams', entity: 'exam', entityId: id });
}

export async function deleteExam(db: Db, actor: Actor, id: number) {
  const [e] = await db.delete(exam).where(eq(exam.id, id)).returning();
  if (e) await audit(db, actor, { action: `Deleted exam “${e.title}” and its results`, page: 'Exams', entity: 'exam', entityId: id });
}

export const testInput = z.object({
  name: z.string().trim().min(1, 'Name the paper').max(80),
  subjectId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  maxMarks: z.coerce.number().int().min(1, 'At least 1 mark').max(1000)
});

/** "Edit tests": the papers (usually one per subject) and their maximum marks. Locked exams can't change. */
export async function saveTest(db: Db, actor: Actor, examId: number, raw: unknown, id?: number) {
  const p = testInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [e] = await db.select().from(exam).where(eq(exam.id, examId));
  if (!e || e.status === 'locked') return { ok: false as const, errors: { name: e ? 'This exam is locked' : 'This exam no longer exists' } };
  if (id) {
    const [over] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(examResult).where(and(eq(examResult.testId, id), sql`${examResult.markTenths} > ${p.data.maxMarks * 10}`));
    if (over?.n) return { ok: false as const, errors: { maxMarks: `${over.n === 1 ? '1 result is' : `${over.n} results are`} above this maximum` } };
    await db.update(examTest).set(p.data).where(and(eq(examTest.id, id), eq(examTest.examId, examId)));
  } else await db.insert(examTest).values({ ...p.data, examId, sortOrder: 99 });
  await audit(db, actor, { action: `Saved paper “${p.data.name}” on exam “${e.title}”`, page: 'Exams', entity: 'exam', entityId: examId });
  return { ok: true as const };
}

export async function deleteTest(db: Db, actor: Actor, examId: number, testId: number) {
  const [e] = await db.select().from(exam).where(eq(exam.id, examId));
  if (!e || e.status === 'locked') return;
  await db.delete(examTest).where(and(eq(examTest.id, testId), eq(examTest.examId, examId)));
  await audit(db, actor, { action: `Removed a paper from exam “${e.title}”`, page: 'Exams', entity: 'exam', entityId: examId });
}

/** "45.5" → 455 tenths; "" → null; "abs"/"a" → absent. */
export function parseMark(raw: string): { tenths: number | null; absent: boolean } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return { tenths: null, absent: false };
  if (s === 'a' || s === 'abs' || s === 'absent') return { tenths: null, absent: true };
  const m = /^(\d{1,4})(?:\.(\d))?$/.exec(s);
  return m ? { tenths: Number(m[1]) * 10 + Number(m[2] ?? 0), absent: false } : null;
}
export const showMark = (tenths: number | null, absent = false) => (absent ? 'Abs' : tenths === null ? '' : tenths % 10 ? (tenths / 10).toFixed(1) : String(tenths / 10));

/** The results grid: students in the class on the exam date, each paper's mark, total, %, grade and position. */
export async function examResults(db: DbOrTx, examId: number) {
  const [e] = await db.select({ e: exam, className: schoolClass.name }).from(exam).innerJoin(schoolClass, eq(schoolClass.id, exam.classId)).where(eq(exam.id, examId));
  if (!e) return null;
  const tests = await db.select({ t: examTest, subjectName: subject.name }).from(examTest).leftJoin(subject, eq(subject.id, examTest.subjectId)).where(eq(examTest.examId, examId)).orderBy(asc(examTest.sortOrder), asc(examTest.id));
  const [kids, results, bands] = await Promise.all([
    classStudentsOn(db, e.e.classId, e.e.date),
    tests.length ? db.select().from(examResult).where(inArray(examResult.testId, tests.map((t) => t.t.id))) : Promise.resolve([]),
    e.e.gradeSystemId ? db.select().from(gradeBand).where(eq(gradeBand.systemId, e.e.gradeSystemId)) : db.select({ systemId: gradeBand.systemId, minPct: gradeBand.minPct, grade: gradeBand.grade }).from(gradeBand).innerJoin(gradeSystem, eq(gradeSystem.id, gradeBand.systemId)).where(eq(gradeSystem.isDefault, true))
  ]);
  const max = tests.reduce((s, t) => s + t.t.maxMarks * 10, 0);
  const rows = kids.map((k) => {
    const mine = results.filter((r) => r.studentId === k.id);
    const marked = mine.filter((r) => r.markTenths !== null);
    const sat = tests.filter((t) => marked.some((r) => r.testId === t.t.id)).reduce((s, t) => s + t.t.maxMarks * 10, 0);
    const total = marked.reduce((s, r) => s + r.markTenths!, 0);
    const pct = sat ? Math.round((total / sat) * 1000) / 10 : null;
    return { student: k, marks: Object.fromEntries(tests.map((t) => { const r = mine.find((x) => x.testId === t.t.id); return [t.t.id, { tenths: r?.markTenths ?? null, absent: !!r?.absent }]; })), total, pct, grade: gradeFor(pct, bands), position: 0 };
  });
  // Position by %, ties sharing a place (1, 2, 2, 4).
  const ranked = rows.filter((r) => r.pct !== null).sort((a, b) => b.pct! - a.pct!);
  ranked.forEach((r, i) => { r.position = i && ranked[i - 1]!.pct === r.pct ? ranked[i - 1]!.position : i + 1; });
  return { exam: e.e, className: e.className, tests, rows, maxTenths: max };
}

/** Saves the grid. Admins can enter results while the exam is open or closed; locked exams can't change. */
export async function saveResults(db: Db, actor: Actor, examId: number, cells: Record<string, string>) {
  return db.transaction(async (tx) => {
    const data = await examResults(tx, examId);
    if (!data) return { ok: false as const, error: 'This exam no longer exists' };
    if (data.exam.status === 'locked') return { ok: false as const, error: 'This exam is locked' };
    const errors: string[] = [];
    let saved = 0;
    for (const r of data.rows) for (const t of data.tests) {
      const raw = cells[`${t.t.id}:${r.student.id}`];
      if (raw === undefined) continue;
      const m = parseMark(raw);
      if (!m) { errors.push(`${r.student.firstName} ${r.student.surname}, ${t.t.name}: “${raw}” isn’t a mark`); continue; }
      if (m.tenths !== null && m.tenths > t.t.maxMarks * 10) { errors.push(`${r.student.firstName} ${r.student.surname}, ${t.t.name}: more than ${t.t.maxMarks}`); continue; }
      if (m.tenths === null && !m.absent) await tx.delete(examResult).where(and(eq(examResult.testId, t.t.id), eq(examResult.studentId, r.student.id)));
      else await tx.insert(examResult).values({ testId: t.t.id, studentId: r.student.id, markTenths: m.tenths, absent: m.absent })
        .onConflictDoUpdate({ target: [examResult.testId, examResult.studentId], set: { markTenths: m.tenths, absent: m.absent, updatedAt: new Date() } });
      saved++;
    }
    if (errors.length) throw Object.assign(new Error('marks'), { marks: errors });
    await audit(tx, actor, { action: `Entered results for “${data.exam.title}” (${data.className})`, page: 'Exam results', entity: 'exam', entityId: examId });
    return { ok: true as const, saved };
  }).catch((e: Error & { marks?: string[] }) => { if (e.marks) return { ok: false as const, error: e.marks.slice(0, 5).join('; ') }; throw e; });
}

/* ───────── Semesters and quizzes ───────── */

export const semesterInput = z.object({
  title: z.string().trim().min(1, 'Give the semester a title').max(80),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  examIds: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one exam').max(100)
});
export async function saveSemester(db: Db, actor: Actor, yearId: number, raw: unknown, id?: number) {
  const p = semesterInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(semester).set(p.data).where(eq(semester.id, id)).returning() : await db.insert(semester).values({ ...p.data, academicYearId: yearId }).returning();
  await audit(db, actor, { action: `Saved semester “${p.data.title}”`, page: 'Semesters', entity: 'semester', entityId: row?.id });
  return { ok: true as const };
}

/** One result per student across a semester's exams: all their marks over all papers they sat. */
export async function semesterResults(db: DbOrTx, semesterId: number) {
  const [s] = await db.select().from(semester).where(eq(semester.id, semesterId));
  if (!s) return null;
  const per = new Map<number, { name: string; total: number; max: number }>();
  for (const eid of s.examIds) {
    const r = await examResults(db, eid);
    if (!r || (s.classIds.length && !s.classIds.includes(r.exam.classId))) continue;
    for (const row of r.rows) {
      const cur = per.get(row.student.id) ?? { name: `${row.student.firstName} ${row.student.surname}`, total: 0, max: 0 };
      for (const t of r.tests) { const m = row.marks[t.t.id]!; if (m.tenths !== null) { cur.total += m.tenths; cur.max += t.t.maxMarks * 10; } }
      per.set(row.student.id, cur);
    }
  }
  return { semester: s, rows: [...per].map(([id, v]) => ({ studentId: id, ...v, pct: v.max ? Math.round((v.total / v.max) * 1000) / 10 : null })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export const quizInput = z.object({
  subjectId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  title: z.string().trim().min(1, 'Give the quiz a title').max(120),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time'),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time'),
  teacherId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  status: z.enum(['draft', 'open', 'closed'])
}).refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'], message: 'The end must be after the start' });

export const listQuizzes = (db: DbOrTx) => db.select({ q: quiz, subjectName: subject.name, teacherName: teacher.name }).from(quiz).leftJoin(subject, eq(subject.id, quiz.subjectId)).leftJoin(teacher, eq(teacher.id, quiz.teacherId)).orderBy(desc(quiz.startsAt));

export async function saveQuiz(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = quizInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const { startsAt, endsAt, ...v } = p.data;
  const values = { ...v, startsAt: ukLocal(startsAt), endsAt: ukLocal(endsAt) };
  const [row] = id ? await db.update(quiz).set(values).where(eq(quiz.id, id)).returning() : await db.insert(quiz).values(values).returning();
  await audit(db, actor, { action: `Saved quiz “${v.title}”`, page: 'Quizzes', entity: 'quiz', entityId: row?.id });
  return { ok: true as const };
}
export async function deleteQuiz(db: Db, actor: Actor, id: number) {
  const [q] = await db.delete(quiz).where(eq(quiz.id, id)).returning();
  if (q) await audit(db, actor, { action: `Deleted quiz “${q.title}”`, page: 'Quizzes', entity: 'quiz', entityId: id });
}
