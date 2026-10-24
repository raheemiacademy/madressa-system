import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { classAssignment, eotyEntry, eotyParagraph, eotyReport, exam, homework, homeworkStudent, incident, schoolClass, student } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { isoDate, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { studentSummaries } from '../attendance/registers';
import type { Actor } from '../people/common';
import { examResults, semesterResults } from './exams';

/* ───────── Paragraph templates (Behaviour, Progress, Effort × five levels) ───────── */

export const AREAS = ['behaviour', 'progress', 'effort'] as const;
export type Area = (typeof AREAS)[number];
export const PARAGRAPH_VARS = ['{FIRST_NAME}', '{NAME}', '{HE_SHE}', '{HIS_HER}', '{HIM_HER}', '{SCORE}'];
export const DEFAULT_PARAGRAPHS: Record<Area, string[]> = {
  behaviour: [
    '{FIRST_NAME} finds it hard to follow class rules and needs regular reminders. We will keep working on this together.',
    '{FIRST_NAME}’s behaviour is improving, though {HE_SHE} sometimes needs reminders to stay focused.',
    '{FIRST_NAME} behaves well in class and is respectful to teachers and classmates.',
    '{FIRST_NAME} is consistently well behaved, polite and a positive example to others.',
    '{FIRST_NAME}’s behaviour is excellent. {HE_SHE} is courteous, kind and a role model in class.'
  ],
  progress: [
    '{FIRST_NAME} has found this term’s work difficult and needs extra support to make progress.',
    '{FIRST_NAME} is making steady progress and is beginning to grasp the main topics.',
    '{FIRST_NAME} has made good progress this term and understands most of what was taught.',
    '{FIRST_NAME} has made very good progress and is confident with this term’s work.',
    '{FIRST_NAME} has made excellent progress and is working well beyond expectations.'
  ],
  effort: [
    '{FIRST_NAME} needs to put more effort into classwork and homework.',
    '{FIRST_NAME} tries hard at times and would benefit from more consistent effort.',
    '{FIRST_NAME} puts good effort into lessons and homework.',
    '{FIRST_NAME} works very hard and always tries {HIS_HER} best.',
    '{FIRST_NAME}’s effort is outstanding in every lesson.'
  ]
};

export async function paragraphs(db: DbOrTx) {
  const rows = await db.select().from(eotyParagraph);
  return Object.fromEntries(AREAS.map((a) => [a, DEFAULT_PARAGRAPHS[a].map((d, i) => rows.find((r) => r.area === a && r.level === i + 1)?.body ?? d)])) as Record<Area, string[]>;
}

export const paragraphsInput = z.object(Object.fromEntries(AREAS.map((a) => [a, z.array(z.string().trim().min(1, 'Every level needs some text').max(2000)).length(5)])) as Record<Area, z.ZodArray<z.ZodString>>);

/** Saves all 15 paragraphs (also how a backup is restored). Text equal to the built-in default isn't stored. */
export async function saveParagraphs(db: Db, actor: Actor, raw: unknown) {
  const p = paragraphsInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the paragraphs' };
  await db.transaction(async (tx) => {
    await tx.delete(eotyParagraph);
    const rows = AREAS.flatMap((a) => p.data[a].map((body, i) => ({ area: a, level: i + 1, body }))).filter((r) => r.body !== DEFAULT_PARAGRAPHS[r.area][r.level - 1]);
    if (rows.length) await tx.insert(eotyParagraph).values(rows);
    await audit(tx, actor, { action: 'Saved EOTY paragraph templates', page: 'EOTY reports', entity: 'eoty_paragraph' });
  });
  return { ok: true as const };
}

export async function restoreDefaultParagraphs(db: Db, actor: Actor) {
  await db.delete(eotyParagraph);
  await audit(db, actor, { action: 'Restored the default EOTY paragraph templates', page: 'EOTY reports', entity: 'eoty_paragraph' });
}

// With no gender recorded, the first name stands in, so verbs still agree ("Sam works hard", not "they works hard").
const pronouns = (gender: string, first: string) => gender === 'Male' ? { HE_SHE: 'he', HIS_HER: 'his', HIM_HER: 'him' } : gender === 'Female' ? { HE_SHE: 'she', HIS_HER: 'her', HIM_HER: 'her' } : { HE_SHE: first, HIS_HER: `${first}’s`, HIM_HER: first };
/** Fills a paragraph for a student. Sentence-initial pronouns are capitalised. */
export function fillParagraph(text: string, s: { firstName: string; surname: string; gender: string }, score: string) {
  const v: Record<string, string> = { FIRST_NAME: s.firstName, NAME: `${s.firstName} ${s.surname}`, SCORE: score, ...pronouns(s.gender, s.firstName) };
  return text.replace(/\{([A-Z_]+)\}/g, (m, k: string) => v[k] ?? m).replace(/(^|[.!?]\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

/* ───────── Reports ───────── */

export const reportInput = z.object({
  title: z.string().trim().min(1, 'Give the report a name').max(120),
  termStart: isoDate, termEnd: isoDate,
  semesterId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  includeExams: z.boolean(), includePositions: z.boolean(), includeAttendance: z.boolean(), includeHomework: z.boolean(),
  scoring: z.boolean(), active: z.boolean(), teachersCanDownload: z.boolean(),
  scoreLabels: z.array(z.string().trim().min(1).max(30)).min(2, 'Add at least two score labels').max(10),
  questions: z.array(z.string().trim().min(1).max(80)).max(12)
}).refine((v) => v.termEnd >= v.termStart, { path: ['termEnd'], message: 'The term can’t end before it starts' });

export const listReports = (db: DbOrTx, yearId?: number) => db.select().from(eotyReport).where(yearId ? eq(eotyReport.academicYearId, yearId) : undefined).orderBy(desc(eotyReport.termEnd));

export async function saveReport(db: Db, actor: Actor, yearId: number, raw: unknown, id?: number) {
  const p = reportInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(eotyReport).set(p.data).where(eq(eotyReport.id, id)).returning() : await db.insert(eotyReport).values({ ...p.data, academicYearId: yearId }).returning();
  await audit(db, actor, { action: `Saved EOTY report “${p.data.title}”`, page: 'EOTY reports', entity: 'eoty_report', entityId: row?.id });
  return { ok: true as const, id: row!.id };
}

/** Students in a class at any time during the report's term. */
export async function termStudents(db: DbOrTx, r: { termStart: string; termEnd: string }, classId: number) {
  return db.selectDistinct({ id: student.id, firstName: student.firstName, surname: student.surname, gender: student.gender }).from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId))
    .where(and(eq(classAssignment.classId, classId), lte(classAssignment.fromDate, r.termEnd), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, r.termStart))))
    .orderBy(asc(student.surname), asc(student.firstName));
}

export async function entriesFor(db: DbOrTx, reportId: number, classId: number) {
  const [r] = await db.select().from(eotyReport).where(eq(eotyReport.id, reportId));
  if (!r) return null;
  const kids = await termStudents(db, r, classId);
  const rows = kids.length ? await db.select().from(eotyEntry).where(and(eq(eotyEntry.reportId, reportId), inArray(eotyEntry.studentId, kids.map((k) => k.id)))) : [];
  return { report: r, students: kids.map((k) => ({ ...k, entry: rows.find((x) => x.studentId === k.id) ?? null })) };
}

/** Comments and scores written by admin staff (teachers write theirs in the teacher portal, Phase 8). */
export async function saveEntries(db: Db, actor: Actor, reportId: number, rows: { studentId: number; scores: number[]; comment: string }[]) {
  const [r] = await db.select().from(eotyReport).where(eq(eotyReport.id, reportId));
  if (!r) return { ok: false as const, error: 'This report no longer exists' };
  const max = r.scoreLabels.length;
  await db.transaction(async (tx) => {
    for (const x of rows) {
      const scores = x.scores.slice(0, r.questions.length).map((n) => (Number.isInteger(n) && n >= 1 && n <= max ? n : 0));
      const comment = x.comment.trim().slice(0, 5000) || null;
      await tx.insert(eotyEntry).values({ reportId, studentId: x.studentId, scores, comment, writtenBy: actor.name })
        .onConflictDoUpdate({ target: [eotyEntry.reportId, eotyEntry.studentId], set: { scores, comment, writtenBy: actor.name, updatedAt: new Date() } });
    }
    await audit(tx, actor, { action: `Saved EOTY comments for ${rows.length === 1 ? '1 student' : `${rows.length} students`} (“${r.title}”)`, page: 'EOTY reports', entity: 'eoty_report', entityId: reportId });
  });
  return { ok: true as const };
}

/** Overview: per class, how many students have a comment or scores written. */
export async function overview(db: DbOrTx, reportId: number) {
  const [r] = await db.select().from(eotyReport).where(eq(eotyReport.id, reportId));
  if (!r) return null;
  const classes = await db.select().from(schoolClass).where(eq(schoolClass.academicYearId, r.academicYearId)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
  const out = [];
  for (const c of classes) {
    const e = await entriesFor(db, reportId, c.id);
    const n = e?.students.length ?? 0;
    if (!n) continue;
    const written = e!.students.filter((s) => s.entry && (s.entry.comment || s.entry.scores.some((x) => x > 0))).length;
    out.push({ classId: c.id, name: c.name, students: n, written });
  }
  return { report: r, classes: out };
}

/** Everything one student's report shows, using only data inside the report's term. */
export async function buildReport(db: DbOrTx, reportId: number, studentId: number, classId: number) {
  const [r] = await db.select().from(eotyReport).where(eq(eotyReport.id, reportId));
  const [s] = await db.select().from(student).where(eq(student.id, studentId));
  const [c] = await db.select().from(schoolClass).where(eq(schoolClass.id, classId));
  if (!r || !s || !c) return null;
  const [entry] = await db.select().from(eotyEntry).where(and(eq(eotyEntry.reportId, reportId), eq(eotyEntry.studentId, studentId)));
  const paras = await paragraphs(db);
  const scored = r.scoring ? r.questions.map((q, i) => {
    const score = entry?.scores[i] ?? 0;
    const area = AREAS.find((a) => a === q.toLowerCase());
    return { question: q, score, label: score ? r.scoreLabels[score - 1] ?? '' : '', paragraph: area && score ? fillParagraph(paras[area][Math.min(score, 5) - 1]!, s, r.scoreLabels[score - 1] ?? '') : '' };
  }) : [];
  const attendance = r.includeAttendance ? (await studentSummaries(db, r.termStart, r.termEnd)).summaries.find((x) => x.studentId === studentId)?.summary ?? null : null;
  let hw: { total: number; completed: number } | null = null;
  if (r.includeHomework) {
    const rows = await db.select({ done: homeworkStudent.completedAt }).from(homeworkStudent).innerJoin(homework, eq(homework.id, homeworkStudent.homeworkId))
      .where(and(eq(homeworkStudent.studentId, studentId), eq(homework.active, true), gte(homework.deadlineAt, new Date(`${r.termStart}T00:00:00Z`)), lte(homework.deadlineAt, new Date(`${r.termEnd}T23:59:59Z`))));
    hw = { total: rows.length, completed: rows.filter((x) => x.done).length };
  }
  const exams: { title: string; papers: { name: string; mark: string; max: number }[]; pct: number | null; grade: string; position: string }[] = [];
  let semesterPct: number | null = null;
  if (r.includeExams) {
    const ids = r.semesterId ? ((await semesterResults(db, r.semesterId))?.semester.examIds ?? [])
      : (await db.select({ id: exam.id }).from(exam).where(and(eq(exam.classId, classId), eq(exam.official, true), gte(exam.date, r.termStart), lte(exam.date, r.termEnd)))).map((x) => x.id);
    for (const id of ids) {
      const res = await examResults(db, id);
      const row = res?.rows.find((x) => x.student.id === studentId);
      if (!res || !row) continue;
      const sat = res.rows.filter((x) => x.pct !== null).length;
      exams.push({ title: res.exam.title, papers: res.tests.map((t) => { const m = row.marks[t.t.id]!; return { name: t.t.name, mark: m.absent ? 'Absent' : m.tenths === null ? '—' : String(m.tenths / 10), max: t.t.maxMarks }; }),
        pct: row.pct, grade: row.grade, position: r.includePositions && row.position ? `${row.position} of ${sat}` : '' });
    }
    if (r.semesterId) semesterPct = (await semesterResults(db, r.semesterId))?.rows.find((x) => x.studentId === studentId)?.pct ?? null;
  }
  const incidents = (await db.select().from(incident).where(and(eq(incident.studentId, studentId), eq(incident.inEoty, true), gte(incident.occurredAt, new Date(`${r.termStart}T00:00:00Z`)), lte(incident.occurredAt, new Date(`${r.termEnd}T23:59:59Z`))))
    .orderBy(asc(incident.occurredAt))).map((i) => ({ when: formatInstant(i.occurredAt, 'dd/MM/yyyy'), title: i.title, severity: i.severity }));
  return { report: r, student: s, className: c.name, scored, comment: entry?.comment ?? '', writtenBy: entry?.writtenBy ?? '', attendance, homework: hw, exams, semesterPct, incidents };
}
