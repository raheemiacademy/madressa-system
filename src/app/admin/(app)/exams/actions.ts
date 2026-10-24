'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { resolveYear } from '@/server/academic-years';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { deleteExam, deleteQuiz, deleteTest, saveExam, saveGradeSystem, saveQuiz, saveResults, saveSemester, saveTest, setExamStatus, STANDARD_GRADES } from '@/server/learning/exams';

const done = () => revalidatePath('/admin', 'layout');
const yearId = async () => (await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null)).year?.id ?? null;
const all = (fd: FormData, k: string) => fd.getAll(k).map(String);

export async function saveExamAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveExam(db, actorOf(a), formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  if (!id) redirect(`/admin/exams/${r.id}`);
  return { ok: true, message: 'Exam saved.' };
}

export async function statusAction(id: number, status: 'open' | 'closed' | 'locked') {
  const a = await requireAdmin('edit');
  await setExamStatus(db, actorOf(a), id, status);
  done();
  return {};
}

export async function deleteExamAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteExam(db, actorOf(a), id);
  done();
  redirect('/admin/exams');
}

export async function saveTestAction(examId: number, id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveTest(db, actorOf(a), examId, formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Paper saved.' };
}

export async function deleteTestAction(examId: number, testId: number) {
  const a = await requireAdmin('edit');
  await deleteTest(db, actorOf(a), examId, testId);
  done();
  return {};
}

/** The results grid posts one field per paper and student, named "testId:studentId". */
export async function resultsAction(examId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const cells = Object.fromEntries([...fd.entries()].filter(([k]) => /^\d+:\d+$/.test(k)).map(([k, v]) => [k, String(v)]));
  const r = await saveResults(db, actorOf(a), examId, cells);
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: 'Results saved.' };
}

export async function saveSemesterAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const y = await yearId();
  if (!y) return { message: 'Add an academic year first.' };
  const r = await saveSemester(db, actorOf(a), y, { title: fd.get('title'), classIds: all(fd, 'classIds'), examIds: all(fd, 'examIds') }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Semester saved.' };
}

export async function saveQuizAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveQuiz(db, actorOf(a), { ...formObject(fd), classIds: all(fd, 'classIds') }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Quiz saved.' };
}

export async function deleteQuizAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteQuiz(db, actorOf(a), id);
  done();
  return {};
}

/** Grades are typed one per line: "90 A*". */
export async function saveGradesAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const lines = String(fd.get('bands') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bands = lines.map((l) => /^(\d{1,3})\s*%?\s+(.+)$/.exec(l)).map((m) => (m ? { minPct: m[1]!, grade: m[2]!.trim() } : null));
  if (bands.some((b) => !b)) return { errors: { bands: 'Write each grade as a percentage then the grade, e.g. 90 A*' } };
  const r = await saveGradeSystem(db, actorOf(a), { name: fd.get('name'), isDefault: fd.get('isDefault') === 'on', bands }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Grades saved.' };
}

export async function loadStandardAction() {
  const a = await requireAdmin('edit');
  const r = await saveGradeSystem(db, actorOf(a), { name: 'Standard', isDefault: true, bands: STANDARD_GRADES.map(([minPct, grade]) => ({ minPct, grade })) });
  done();
  return r.ok ? { message: 'Standard grades loaded.' } : { error: Object.values(r.errors)[0] };
}
