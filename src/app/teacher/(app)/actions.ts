'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { cookieName, cookiePath, invalidateSession } from '@/server/auth';
import { exam } from '@/db/schema';
import { marksFromForm } from '@/lib/register-form';
import { zodErrors, type FormState } from '@/lib/validate';
import { addDays, saveRegister } from '@/server/attendance/registers';
import { runningDrill, setClassSafe } from '@/server/attendance/drill';
import { signInOrOut } from '@/server/attendance/teacher-logs';
import { reply, startFromPortal } from '@/server/comm/messages';
import { entriesFor, saveEntries } from '@/server/learning/eoty';
import { saveExam, saveResults, saveTest } from '@/server/learning/exams';
import { post } from '@/server/learning/forums';
import { homeworkInput, saveHomework, sendReminders, setCompleted } from '@/server/learning/homework';
import { saveIncident } from '@/server/learning/incidents';
import { awardMerits } from '@/server/learning/merits';
import { requireTeacher } from '@/server/next/portal';
import { classOf, PortalDenied, studentsInClasses } from '@/server/portal/access';
import { parseRecipient, recipientsFor } from '@/server/portal/messages';
import { visibleCategory, visibleTopic } from '@/server/portal/shared';
import { adjustMyLog, homeworkRoster, homeworkRow } from '@/server/portal/teacher';
import { todayIso } from '@/server/people/common';

/* §20 Teacher portal actions. Each one checks the session, the section and the class privilege again. */

const denied = (e: unknown): FormState => { if (e instanceof PortalDenied) return { ok: false, message: 'You don’t have that privilege for this class.' }; throw e; };
const classIds = (t: Awaited<ReturnType<typeof requireTeacher>>) => t.ctx.classes.map((c) => c.id);

export async function signAction(): Promise<{ error?: string; message?: string }> {
  const t = await requireTeacher();
  const r = await signInOrOut(db, t.ctx.teacher.id, 'portal');
  revalidatePath('/teacher');
  return r.ok ? { message: r.did === 'in' ? `Signed in at ${r.time}.` : `Signed out at ${r.time}.` } : { error: r.error };
}

export async function adjustLogAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Teacher Logs');
  const r = await adjustMyLog(db, t.actor, t.ctx, { timeIn: String(fd.get('timeIn') ?? ''), timeOut: String(fd.get('timeOut') ?? '') });
  revalidatePath('/teacher');
  return r.ok ? { ok: true, message: 'Saved.' } : { ok: false, message: r.error };
}

/** Teachers take today's register, or catch up on the last week's. */
export async function registerAction(classId: number, date: string, startTime: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Registers');
  try {
    classOf(t.ctx, classId, 'canRegister');
    if (date > todayIso() || date < addDays(todayIso(), -7)) return { ok: false, message: 'Registers can be taken for today and the past week only.' };
    // Teachers don't decide authorisation: that stays with the office.
    const r = await saveRegister(db, t.actor, { classId, date, startTime, marks: marksFromForm(fd).map((m) => ({ ...m, authorised: '' })) });
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath('/teacher');
    return { ok: true, message: 'Register saved.' };
  } catch (e) { return denied(e); }
}

export async function homeworkAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Homework');
  try {
    const classId = Number(fd.get('classId'));
    if (!classId) return { ok: false, errors: { classId: 'Choose a class' } };
    classOf(t.ctx, classId, 'canHomework');
    const date = String(fd.get('dueDate') ?? ''), time = String(fd.get('dueTime') ?? '') || '17:00';
    const raw = { classId, teacherId: t.ctx.teacher.id, title: fd.get('title'), deadline: `${date}T${time}`, instructions: fd.get('instructions') ?? '',
      allowUploads: fd.get('allowUploads') ?? '', notifyContacts: fd.get('notifyContacts') ?? '', lockAfterDeadline: fd.get('lockAfterDeadline') ?? '' };
    const check = homeworkInput.safeParse(raw);
    if (!check.success) { const e = zodErrors(check.error); return { ok: false, errors: { ...e, ...(e.deadline ? { dueDate: 'Choose the due date and time' } : {}) } }; }
    const r = await saveHomework(db, t.actor, raw);
    if (!r.ok) return { ok: false, errors: r.errors };
    revalidatePath('/teacher/homework');
    return { ok: true, message: `Set for ${r.students === 1 ? '1 student' : `${r.students} students`}${r.emailed ? `, ${r.emailed === 1 ? '1 parent' : `${r.emailed} parents`} emailed` : ''}.` };
  } catch (e) { return denied(e); }
}

async function myHomeworkOrDeny(t: Awaited<ReturnType<typeof requireTeacher>>, homeworkId: number) {
  const h = await homeworkRow(db, homeworkId);
  if (!h) throw new PortalDenied();
  classOf(t.ctx, h.classId, 'canHomework');
  return h;
}

export async function completeAction(homeworkId: number, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Homework');
  try {
    await myHomeworkOrDeny(t, homeworkId);
    await setCompleted(db, t.actor, homeworkId, fd.getAll('done').map(Number));
    revalidatePath(`/teacher/homework/${homeworkId}`);
    return { ok: true, message: 'Saved.' };
  } catch (e) { return denied(e); }
}

export async function remindAction(homeworkId: number): Promise<{ error?: string; message?: string }> {
  const t = await requireTeacher('Homework');
  try { await myHomeworkOrDeny(t, homeworkId); } catch { return { error: 'Not allowed' }; }
  const missing = (await homeworkRoster(db, homeworkId)).filter((s) => !s.completedAt && !s.uploadedAt);
  if (!missing.length) return { message: 'Everyone has handed it in.' };
  const n = await sendReminders(db, t.actor, missing.map((s) => [homeworkId, s.id] as [number, number]));
  return { message: n ? `Reminded ${n === 1 ? '1 parent' : `${n} parents`}.` : 'No parent emails to send to.' };
}

export async function meritAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Merits');
  const allowed = new Set((await studentsInClasses(db, t.ctx.classes.filter((c) => c.canMerits).map((c) => c.id))).map((s) => s.id));
  const ids = fd.getAll('studentIds').map(Number);
  if (ids.some((i) => !allowed.has(i))) return { ok: false, message: 'You can only award merits to students in your merit classes.' };
  const r = await awardMerits(db, t.actor, { meritId: fd.get('meritId'), studentIds: ids, awardedOn: todayIso(), comment: fd.get('comment') ?? '' });
  if (!r.ok) return { ok: false, errors: r.errors, message: Object.values(r.errors)[0] };
  revalidatePath('/teacher/merits');
  return { ok: true, message: `Awarded to ${r.n === 1 ? '1 student' : `${r.n} students`}.` };
}

export async function incidentAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Incidents');
  const studentId = Number(fd.get('studentId'));
  const kid = (await studentsInClasses(db, t.ctx.classes.filter((c) => c.canIncidents).map((c) => c.id))).find((s) => s.id === studentId);
  if (!kid) return { ok: false, errors: { studentId: 'Choose a student from your classes' } };
  // Teachers record; the office decides whether to share it with parents or put it on a report.
  const r = await saveIncident(db, t.actor, { kind: 'student', studentId, classId: kid.classId, severity: fd.get('severity'), occurredAt: fd.get('occurredAt'), title: fd.get('title'), report: fd.get('report'), action: fd.get('action') ?? '' });
  if (!r.ok) return { ok: false, errors: r.errors };
  revalidatePath('/teacher/incidents');
  return { ok: true, message: 'Recorded. The office will see it on their Incidents page.' };
}

export async function examAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher(fd.get('official') === 'progressive' ? 'Progressive Tests' : 'Exams');
  try {
    classOf(t.ctx, Number(fd.get('classId')));
    const r = await saveExam(db, t.actor, { classId: fd.get('classId'), official: fd.get('official'), title: fd.get('title'), date: fd.get('date'), gradeSystemId: '' });
    if (!r.ok) return { ok: false, errors: r.errors };
    redirect(`/teacher/exams/${r.id}`);
  } catch (e) { return denied(e); }
}

async function myOpenExam(t: Awaited<ReturnType<typeof requireTeacher>>, examId: number) {
  const [e] = await db.select().from(exam).where(eq(exam.id, examId));
  if (!e) throw new PortalDenied();
  classOf(t.ctx, e.classId);
  return e;
}

export async function paperAction(examId: number, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher();
  try {
    const e = await myOpenExam(t, examId);
    if (e.status !== 'open') return { ok: false, message: 'This exam is closed. Ask the office to reopen it.' };
    const r = await saveTest(db, t.actor, examId, { name: fd.get('name'), subjectId: '', maxMarks: fd.get('maxMarks') });
    if (!r.ok) return { ok: false, errors: r.errors };
    revalidatePath(`/teacher/exams/${examId}`);
    return { ok: true, message: 'Paper added.' };
  } catch (e) { return denied(e); }
}

export async function resultsAction(examId: number, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher();
  try {
    const e = await myOpenExam(t, examId);
    if (e.status !== 'open') return { ok: false, message: 'This exam is closed. Ask the office to reopen it.' };
    const cells: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (/^\d+:\d+$/.test(k)) cells[k] = String(v);
    const r = await saveResults(db, t.actor, examId, cells);
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath(`/teacher/exams/${examId}`);
    return { ok: true, message: 'Results saved.' };
  } catch (e) { return denied(e); }
}

export async function commentsAction(reportId: number, classId: number, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('EOTY Reports');
  try {
    classOf(t.ctx, classId, 'canEoty');
    const data = await entriesFor(db, reportId, classId);
    if (!data || !data.report.active) return { ok: false, message: 'This report isn’t open for comments.' };
    const rows = data.students.map((s) => ({ studentId: s.id, scores: data.report.questions.map((_, i) => Number(fd.get(`score.${s.id}.${i}`)) || 0), comment: String(fd.get(`comment.${s.id}`) ?? '') }));
    const r = await saveEntries(db, t.actor, reportId, rows);
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath(`/teacher/reports/${reportId}`);
    return { ok: true, message: 'Comments saved.' };
  } catch (e) { return denied(e); }
}

export async function drillSafeAction(classId: number, safe: boolean): Promise<{ error?: string } | void> {
  const t = await requireTeacher();
  try { classOf(t.ctx, classId); } catch { return { error: 'Not your class' }; }
  const d = await runningDrill(db);
  if (!d) return { error: 'The drill has ended' };
  await setClassSafe(db, d.id, classId, safe);
  revalidatePath('/teacher/drill');
}

export async function newMessageAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher();
  const to = parseRecipient(String(fd.get('to') ?? ''));
  const allowed = await recipientsFor(db, t.party, t.ctx.classes.filter((c) => c.canMessage).map((c) => c.id));
  if (!to || !allowed.some((a) => a.value === String(fd.get('to')))) return { ok: false, errors: { to: 'Choose who to write to' } };
  const r = await startFromPortal(db, t.party, to, String(fd.get('subject') ?? ''), String(fd.get('body') ?? ''));
  if (!r.ok) return { ok: false, message: r.error };
  redirect(`/teacher/messages/${r.id}`);
}

export async function replyAction(threadId: number, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher();
  const r = await reply(db, t.party, threadId, String(fd.get('body') ?? ''));
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath(`/teacher/messages/${threadId}`);
  return { ok: true, message: 'Sent.' };
}

export async function forumPostAction(where: { categoryId: number } | { topicId: number }, _: FormState, fd: FormData): Promise<FormState> {
  const t = await requireTeacher('Forums');
  const ok = 'topicId' in where ? await visibleTopic(db, classIds(t), where.topicId) : await visibleCategory(db, classIds(t), where.categoryId);
  if (!ok) return { ok: false, message: 'This forum isn’t open to you.' };
  const r = await post(db, t.party, 'topicId' in where ? where : { categoryId: where.categoryId, title: String(fd.get('title') ?? '') }, String(fd.get('body') ?? ''));
  if (!r.ok) return { ok: false, message: r.error };
  if (!('topicId' in where)) redirect(`/teacher/forums/topic/${r.topicId}`);
  revalidatePath(`/teacher/forums/topic/${where.topicId}`);
  return { ok: true, message: 'Posted.' };
}

/** Ends a teacher-portal session a Super admin opened from Teachers, and goes back to that teacher in the admin. */
export async function leaveTeacherViewAction() {
  const t = await requireTeacher();
  const jar = await cookies();
  await invalidateSession(db, jar.get(cookieName('teacher'))?.value);
  jar.delete({ name: cookieName('teacher'), path: cookiePath('teacher') });
  redirect(t.via ? `/admin/teachers/${t.ctx.teacher.id}` : '/teacher/login');
}
