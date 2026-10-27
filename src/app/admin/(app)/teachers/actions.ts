'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requestMeta, requireAdmin } from '@/server/next/actor';
import { setSessionCookie } from '@/server/next/session-cookie';
import { deleteTeachers, emergencyFromForm, openTeacherPortalAs, saveTeacher, setHours } from '@/server/people/teachers';
import { storeUpload } from '@/server/storage';

export async function saveTeacherAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveTeacher(db, actorOf(a), formObject(fd), emergencyFromForm(fd), fd, id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  const photo = fd.get('photo');
  if (photo instanceof File && photo.size) {
    const up = await storeUpload(db, photo, 'image', 'teacher-photo', a.identityId);
    if (!up.ok) return { errors: { photo: up.error }, message: 'The teacher was saved, but the photo wasn’t.' };
    await db.update(teacher).set({ photoFileId: up.file.id }).where(eq(teacher.id, r.id));
  }
  revalidatePath('/admin', 'layout');
  redirect(`/admin/teachers/${r.id}`);
}

export async function deleteTeachersAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('delete');
  const ids = fd.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { message: 'Tick at least one teacher first.' };
  const n = await deleteTeachers(db, actorOf(a), ids);
  revalidatePath('/admin', 'layout');
  return { ok: true, message: `Deleted ${n === 1 ? '1 teacher' : `${n} teachers`}.` };
}

export async function deleteTeacherAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteTeachers(db, actorOf(a), [id]);
  revalidatePath('/admin', 'layout');
  redirect('/admin/teachers');
}

/** Working hours: one teacher's week, or the same times for several teachers on chosen days. */
export async function hoursAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const teacherIds = fd.getAll('teacherIds').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!teacherIds.length) return { message: 'Choose at least one teacher.' };
  const days = fd.getAll('days').map(Number).filter((d) => d >= 1 && d <= 7);
  const rows = days.length
    ? days.map((weekday) => ({ weekday, start: String(fd.get('start') ?? ''), end: String(fd.get('end') ?? '') }))
    : [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: String(fd.get(`start.${weekday}`) ?? ''), end: String(fd.get(`end.${weekday}`) ?? '') }));
  const r = await setHours(db, actorOf(a), teacherIds, rows);
  if (!r.ok) {
    const msg = Object.values(r.errors)[0] ?? 'Check the times';
    return { message: msg, errors: days.length ? { start: msg } : Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [`start.${rows[Number(k.split('.')[1])]?.weekday}`, v])) };
  }
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Working hours saved.' };
}

/** Super admins: open the teacher portal as this teacher (see openTeacherPortalAs). */
export async function viewAsTeacherAction(id: number): Promise<{ error?: string } | void> {
  const a = await requireAdmin('super');
  const r = await openTeacherPortalAs(db, actorOf(a), a.staff.id, id, await requestMeta());
  if (!r.ok) return { error: r.error };
  await setSessionCookie('teacher', r.token);
  redirect('/teacher');
}
