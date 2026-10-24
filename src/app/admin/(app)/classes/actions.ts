'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { schoolClass } from '@/db/schema';
import { formObject, type FormState } from '@/lib/validate';
import { audit } from '@/server/audit';
import { actorOf, requireAdmin } from '@/server/next/actor';
import {
  addSlot, addStudentsToClass, copyTimings, deleteClass, deleteNamed, deleteSlot, deleteTemplate, fixMaintenance, PRIVILEGES,
  removeStudentsFromClass, saveClass, saveRoom, saveSubject, saveTemplate, setClassTeacher
} from '@/server/people/classes';

const done = () => revalidatePath('/admin', 'layout');
const nums = (fd: FormData, k: string) => fd.getAll(k).map(Number).filter((n) => Number.isInteger(n) && n > 0);

export async function saveClassAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveClass(db, actorOf(a), formObject(fd), id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  if (!id) redirect(`/admin/classes/${r.id}`);
  return { ok: true, message: 'Class saved.' };
}

export async function deleteClassAction(id: number) {
  const a = await requireAdmin('delete');
  const r = await deleteClass(db, actorOf(a), id);
  if (!r.ok) return { error: r.error };
  done();
  redirect('/admin/classes');
}

export async function classTeacherAction(classId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const teacherId = Number(fd.get('teacherId'));
  if (!teacherId) return { errors: { teacherId: 'Choose a teacher' } };
  const flags = Object.fromEntries(PRIVILEGES.map(([k]) => [k, fd.get(k) === 'on'])) as Record<(typeof PRIVILEGES)[number][0], boolean>;
  await setClassTeacher(db, actorOf(a), classId, teacherId, flags);
  done();
  return { ok: true, message: 'Privileges saved.' };
}
export async function removeClassTeacherAction(classId: number, teacherId: number) {
  const a = await requireAdmin('edit');
  await setClassTeacher(db, actorOf(a), classId, teacherId, null);
  done();
}

export async function addStudentsAction(classId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const ids = nums(fd, 'studentIds');
  if (!ids.length) return { message: 'Tick at least one student.' };
  await addStudentsToClass(db, actorOf(a), classId, ids, String(fd.get('from') || '') || undefined);
  done();
  return { ok: true, message: `Added ${ids.length === 1 ? '1 student' : `${ids.length} students`}.` };
}
export async function removeStudentAction(classId: number, studentId: number) {
  const a = await requireAdmin('edit');
  await removeStudentsFromClass(db, actorOf(a), classId, [studentId]);
  done();
}

export async function addSlotAction(owner: { classId: number } | { templateId: number }, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await addSlot(db, actorOf(a), owner, formObject(fd));
  if (!r.ok) return { errors: r.errors, message: 'Check the session details.' };
  done();
  return { ok: true, message: 'Session added.' };
}
export async function deleteSlotAction(id: number) {
  const a = await requireAdmin('edit');
  await deleteSlot(db, actorOf(a), id);
  done();
}

/** Apply a template, or duplicate one class's timings, to chosen classes (replaces their timetables). */
export async function copyTimingsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const source = String(fd.get('source') ?? '');
  const m = /^(class|template):(\d+)$/.exec(source);
  const targets = nums(fd, 'targets');
  if (!m) return { errors: { source: 'Choose where to copy from' } };
  if (!targets.length) return { errors: { targets: 'Choose at least one class' } };
  const from = m[1] === 'class' ? { classId: Number(m[2]) } : { templateId: Number(m[2]) };
  const n = await copyTimings(db, actorOf(a), from, targets.filter((t) => !('classId' in from) || t !== from.classId));
  done();
  return { ok: true, message: `Copied ${n === 1 ? '1 session' : `${n} sessions`}.` };
}

export async function saveTemplateAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveTemplate(db, actorOf(a), String(fd.get('name') ?? ''), id);
  if (!r.ok) return { errors: { name: r.error } };
  done();
  if (!id) redirect(`/admin/classes/timetable?template=${r.id}`);
  return { ok: true, message: 'Saved.' };
}
export async function deleteTemplateAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteTemplate(db, actorOf(a), id);
  done();
}

export async function saveRoomAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveRoom(db, actorOf(a), formObject(fd), id);
  if (!r.ok) return { errors: r.errors };
  done();
  return { ok: true, message: 'Saved.' };
}
export async function saveSubjectAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveSubject(db, actorOf(a), formObject(fd), id);
  if (!r.ok) return { errors: r.errors };
  done();
  return { ok: true, message: 'Saved.' };
}
export async function deleteNamedAction(kind: 'classroom' | 'subject', id: number) {
  const a = await requireAdmin('delete');
  await deleteNamed(db, actorOf(a), kind, id);
  done();
}

/** Switch/Rename Classes: rename several classes at once (swapping two names works too). */
export async function renameClassesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const pairs = [...fd.keys()].filter((k) => /^name\.\d+$/.test(k)).map((k) => [Number(k.split('.')[1]), String(fd.get(k) ?? '').trim()] as const);
  if (pairs.some(([, n]) => !n || n.length > 80)) return { message: 'Every class needs a name of 80 characters or fewer.' };
  const lower = pairs.map(([, n]) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) return { message: 'Two classes can’t have the same name.' };
  await db.transaction(async (tx) => {
    // Two passes so swapping names never trips the unique index halfway through.
    for (const [id] of pairs) await tx.update(schoolClass).set({ name: `__renaming_${id}` }).where(eq(schoolClass.id, id));
    for (const [id, name] of pairs) await tx.update(schoolClass).set({ name }).where(eq(schoolClass.id, id));
    await audit(tx, actorOf(a), { action: `Renamed ${pairs.length === 1 ? '1 class' : `${pairs.length} classes`}`, page: 'Switch/rename classes', entity: 'school_class', details: { names: Object.fromEntries(pairs) } });
  });
  done();
  return { ok: true, message: 'Names saved.' };
}

export async function fixMaintenanceAction() {
  const a = await requireAdmin('edit');
  const n = await fixMaintenance(db, actorOf(a));
  done();
  return { error: n ? undefined : 'Nothing needed fixing.' };
}
