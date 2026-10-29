'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { resolveYear } from '@/server/academic-years';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { deleteHomeworkTemplate, emailYearReport, homeworkBulk, saveHomework, saveHomeworkTemplate, sendReminders, setCompleted } from '@/server/learning/homework';
import { readTab } from '@/server/settings';
import { storeAttachment } from '@/server/storage';
import { takeUploads } from '@/server/uploads';

const done = () => revalidatePath('/admin', 'layout');
const ids = (fd: FormData, k = 'ids') => fd.getAll(k).map(Number).filter((n) => Number.isInteger(n) && n > 0);

export async function saveHomeworkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  let fileId: string | null = null;
  await takeUploads(fd); // the file came up first, with progress (FileDrop)
  const f = fd.get('file');
  if (f instanceof File && f.size) {
    const r = await storeAttachment(db, f, (await readTab(db, 'homework')).teacherExtensions as string[], 'homework', a.identityId);
    if (!r.ok) return { errors: { file: r.error }, message: 'Check the file.' };
    fileId = r.file.id;
  }
  const r = await saveHomework(db, actorOf(a), { ...formObject(fd), studentIds: fd.getAll('studentIds').map(String) }, fileId);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  redirect(`/admin/homework/${r.id}`);
}

export async function homeworkBulkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const op = String(fd.get('op'));
  if (!['activate', 'deactivate', 'lock', 'unlock', 'delete'].includes(op)) return { message: 'Choose what to do.' };
  const a = await requireAdmin(op === 'delete' ? 'delete' : 'edit');
  const chosen = ids(fd);
  if (!chosen.length) return { message: 'Tick at least one homework.' };
  const n = await homeworkBulk(db, actorOf(a), chosen, op as 'lock');
  done();
  return { ok: true, message: `Updated ${n === 1 ? '1 homework' : `${n} homeworks`}.` };
}

export async function completedAction(homeworkId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  await setCompleted(db, actorOf(a), homeworkId, ids(fd, 'done'));
  done();
  return { ok: true, message: 'Saved.' };
}

/** Incomplete report: "Send reminders" or "Send a test to me". */
export async function remindersAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const pairs = fd.getAll('pairs').map(String).map((x) => x.split(':').map(Number) as [number, number]).filter(([h, s]) => h > 0 && s > 0);
  if (!pairs.length) return { message: 'Tick at least one student.' };
  const test = fd.get('test') === '1';
  const n = await sendReminders(db, { ...actorOf(a), email: a.email }, pairs, test);
  done();
  return { ok: true, message: test ? `Test queued to ${a.email}.` : `Queued ${n === 1 ? '1 reminder' : `${n} reminders`}.` };
}

export async function yearReportAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  if (!year) return { message: 'Add an academic year first.' };
  const chosen = ids(fd, 'studentIds');
  if (!chosen.length) return { message: 'Tick at least one student.' };
  const n = await emailYearReport(db, actorOf(a), year.id, chosen);
  done();
  return { ok: true, message: `Queued ${n === 1 ? '1 email' : `${n} emails`}.` };
}

export async function saveTemplateAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveHomeworkTemplate(db, actorOf(a), formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Template saved.' };
}

export async function deleteTemplateAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteHomeworkTemplate(db, actorOf(a), id);
  done();
  return {};
}
