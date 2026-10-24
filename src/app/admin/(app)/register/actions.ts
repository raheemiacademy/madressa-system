'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceCode, CODE_TYPES } from '@/db/schema';
import { marksFromForm } from '@/lib/register-form';
import { formObject, type FormState } from '@/lib/validate';
import { audit } from '@/server/audit';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { fixDoubleEntries } from '@/server/attendance/reports';
import { decideMarks, deleteEntries, markAbsent, saveRegister } from '@/server/attendance/registers';
import { deleteHolidayRequest, editHolidayRequest, markNoticeSeen, respondToRequest } from '@/server/attendance/requests';
import { confirmsSchoolName } from '@/server/profile';
import { holidayResponseEmail, sendAttendanceAlerts } from '@/server/comm/notify';

const done = () => revalidatePath('/admin', 'layout');

export async function sendAlertsAction() {
  const a = await requireAdmin('edit');
  const n = await sendAttendanceAlerts(db, actorOf(a));
  done();
  return { message: n ? `Queued ${n === 1 ? '1 email' : `${n} emails`}.` : 'Nobody new to email: everyone listed was already emailed this period, or has no email address.' };
}

/** Entry mode: the register form posts every student's mark. */
export async function saveRegisterAction(classId: number, date: string, startTime: string, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveRegister(db, actorOf(a), { classId, date, startTime, marks: marksFromForm(fd) });
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: 'Register saved.' };
}

/** Mass Authorise, Multiple Validations and the grid's absence menu. */
export async function decideAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await decideMarks(db, actorOf(a), { markIds: fd.getAll('markIds').map(String), authorised: fd.get('authorised') ?? 'keep', notified: fd.get('notified') ?? 'keep', note: fd.get('note') ?? undefined });
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: `Updated ${r.n === 1 ? '1 entry' : `${r.n} entries`}.` };
}

export async function decideOneAction(markId: number, authorised: 'yes' | 'no', note: string) {
  const a = await requireAdmin('edit');
  const r = await decideMarks(db, actorOf(a), { markIds: [markId], authorised, note: note || undefined });
  done();
  return r.ok ? {} : { error: r.error };
}

export async function markAbsentAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await markAbsent(db, actorOf(a), { ...formObject(fd), weekdays: fd.getAll('weekdays').map(String) });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: r.n ? `Marked absent on ${r.n === 1 ? '1 register' : `${r.n} registers`}.` : 'No registers fall in those dates for this student’s classes.' };
}

export async function deleteEntriesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('delete');
  if (!(await confirmsSchoolName(db, String(fd.get('confirmName') ?? '')))) return { errors: { confirmName: 'Type the school name exactly as it appears in the school profile' }, message: 'Nothing was deleted.' };
  const r = await deleteEntries(db, actorOf(a), { ...formObject(fd), studentIds: fd.getAll('studentIds').map(String) });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: `Deleted ${r.n === 1 ? '1 entry' : `${r.n} entries`}.` };
}

export async function fixDoublesAction() {
  const a = await requireAdmin('delete');
  const n = await fixDoubleEntries(db, actorOf(a));
  done();
  return { error: n ? undefined : 'No double entries to fix.' };
}

export async function respondAction(id: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await respondToRequest(db, actorOf(a), id, formObject(fd));
  if (!r.ok) return { message: r.error };
  await holidayResponseEmail(db, id);
  done();
  return { ok: true, message: r.marked ? `Saved. ${r.marked === 1 ? '1 register entry' : `${r.marked} register entries`} marked.` : 'Saved.' };
}
export async function editRequestAction(id: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await editHolidayRequest(db, actorOf(a), id, formObject(fd));
  if (!r.ok) return { errors: r.errors };
  done();
  return { ok: true, message: 'Request updated.' };
}
export async function deleteRequestAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteHolidayRequest(db, actorOf(a), id);
  done();
}
export async function seenNoticeAction(id: number) {
  const a = await requireAdmin();
  await markNoticeSeen(db, actorOf(a), id);
  done();
}

/** DfE code list (§4 Register: code, description, type, keys, late). */
export async function saveCodeAction(existing: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const code = String(fd.get('code') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim();
  const type = String(fd.get('type') ?? '');
  if (!/^[A-Za-z0-9/\\#]{1,3}$/.test(code)) return { errors: { code: 'Use one to three letters, digits or / \\ #' } };
  if (!description || description.length > 120) return { errors: { description: 'Add a description (120 characters or fewer)' } };
  if (!(CODE_TYPES as readonly string[]).includes(type)) return { errors: { type: 'Choose a type' } };
  const values = { code, description, type: type as (typeof CODE_TYPES)[number], keys: String(fd.get('keys') ?? '').slice(0, 5) || null, isLate: fd.get('isLate') === 'on', active: fd.get('active') === 'on', sortOrder: Number(fd.get('sortOrder')) || 0 };
  await db.transaction(async (tx) => {
    if (existing) await tx.update(attendanceCode).set({ ...values, code: existing }).where(eq(attendanceCode.code, existing));
    else await tx.insert(attendanceCode).values(values).onConflictDoUpdate({ target: attendanceCode.code, set: values });
    await audit(tx, actorOf(a), { action: `${existing ? 'Updated' : 'Added'} attendance code ${existing ?? code}`, page: 'Attendance codes', entity: 'attendance_code', entityId: existing ?? code });
  });
  done();
  return { ok: true, message: 'Saved.' };
}

export async function goToRegister(_p: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const q = new URLSearchParams({ class: String(fd.get('class') ?? ''), month: String(fd.get('month') ?? '') });
  redirect(`/admin/register/daily?${q}`);
}
