'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject, student, studentFile } from '@/db/schema';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin, type AdminActor } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { resolveYear } from '@/server/academic-years';
import { createAdmissionFees } from '@/server/fees/generate';
import { studentLeftEmails } from '@/server/comm/notify';
import { isLeftStatus } from '@/server/people/common';
import { addHistory, deleteHistory, moveStudents } from '@/server/people/classes';
import { linkContact, setContactBlocked, setLinkFlags, unlinkContact } from '@/server/people/contacts';
import { deleteNote, saveNote, setConsent } from '@/server/people/extras';
import { addSibling, findSiblings, removeSibling, saveFoundSiblings } from '@/server/people/siblings';
import { bulkUpdate, contactLinksFromForm, deleteStudents, saveStudent } from '@/server/people/students';
import { confirmsSchoolName } from '@/server/profile';
import { readTab } from '@/server/settings';
import { removeStored, storeAttachment, storeUpload } from '@/server/storage';
import { takeUploads } from '@/server/uploads';

const done = (path = '/admin/students') => revalidatePath(path, 'layout');
const ids = (fd: FormData, name = 'ids') => fd.getAll(name).map(Number).filter((n) => Number.isInteger(n) && n > 0);
// Fee options on student forms need Access Fees Area as well as Can edit.
const feesRefused = (a: AdminActor, fd: FormData) => (fd.get('deleteInvoices') === 'on' || fd.get('admissionFee') === 'on' || fd.get('action') === 'admission') && !adminCan(a.staff, 'fees');
const yearId = async () => (await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null)).year?.id ?? null;

export async function saveStudentAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  if (feesRefused(a, fd)) return { message: 'Fee options need the Access Fees Area level.' };
  const r = await saveStudent(db, actorOf(a), formObject(fd), contactLinksFromForm(fd), fd, id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  if (fd.get('sendLeftEmail') === 'on' && isLeftStatus(String(fd.get('status') ?? ''))) await studentLeftEmails(db, [r.id]);
  if (fd.get('admissionFee') === 'on') {
    const y = await yearId();
    const fee = y ? await createAdmissionFees(db, actorOf(a), [r.id], y) : { ok: false as const, error: 'Add an academic year first.' };
    if (!fee.ok) return { message: `The student was saved, but the admission fee wasn’t: ${fee.error}` };
  }
  await takeUploads(fd); // the file came up first, with progress (FileDrop)
  const photo = fd.get('photo');
  if (photo instanceof File && photo.size) {
    const up = await storeUpload(db, photo, 'image', 'student-photo', a.identityId);
    if (!up.ok) return { errors: { photo: up.error }, message: 'The student was saved, but the photo wasn’t.' };
    await db.update(student).set({ photoFileId: up.file.id }).where(eq(student.id, r.id));
  }
  done();
  redirect(`/admin/students/${r.id}`);
}

export async function bulkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const chosen = ids(fd);
  if (!chosen.length) return { message: 'Tick at least one student first.' };
  if (feesRefused(a, fd)) return { message: 'Fee actions need the Access Fees Area level.' };
  if (fd.get('action') === 'admission') {
    const y = await yearId();
    const fee = y ? await createAdmissionFees(db, actorOf(a), chosen, y) : { ok: false as const, error: 'Add an academic year first.' };
    if (!fee.ok) return { message: fee.error };
    done();
    return { ok: true, message: fee.n ? `Created ${fee.n === 1 ? '1 admission fee invoice' : `${fee.n} admission fee invoices`}.` : 'They already have admission fee invoices.' };
  }
  const r = await bulkUpdate(db, actorOf(a), chosen, formObject(fd));
  if (!r.ok) return { message: r.error };
  if (fd.get('action') === 'status' && fd.get('sendLeftEmail') === 'on' && isLeftStatus(String(fd.get('status') ?? ''))) await studentLeftEmails(db, chosen);
  done();
  return { ok: true, message: `Updated ${r.n === 1 ? '1 student' : `${r.n} students`}.` };
}

/** Permanent delete: needs Can Delete and the school name typed exactly. */
export async function deleteStudentsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('delete');
  const chosen = ids(fd);
  if (!chosen.length) return { message: 'Tick at least one student first.' };
  if (!(await confirmsSchoolName(db, String(fd.get('confirmName') ?? '')))) return { errors: { confirmName: 'Type the school name exactly as it appears in the school profile' }, message: 'Nothing was deleted.' };
  const n = await deleteStudents(db, actorOf(a), chosen);
  done();
  return { ok: true, message: `Permanently deleted ${n === 1 ? '1 student' : `${n} students`}.` };
}

export async function deleteOneStudentAction(id: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('delete');
  if (!(await confirmsSchoolName(db, String(fd.get('confirmName') ?? '')))) return { errors: { confirmName: 'Type the school name exactly as it appears in the school profile' } };
  await deleteStudents(db, actorOf(a), [id]);
  done();
  redirect('/admin/students');
}

export async function moveClassesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await moveStudents(db, actorOf(a), { fromClassId: fd.get('fromClassId'), toClassId: fd.get('toClassId'), studentIds: ids(fd), date: fd.get('date') });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done('/admin');
  return { ok: true, message: `Moved ${r.n === 1 ? '1 student' : `${r.n} students`}.` };
}

export async function addHistoryAction(studentId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await addHistory(db, actorOf(a), { ...formObject(fd), studentId });
  if (!r.ok) return { errors: r.errors };
  done();
  return { ok: true, message: 'Added to the class history.' };
}

export async function deleteHistoryAction(assignmentId: number) {
  const a = await requireAdmin('delete');
  await deleteHistory(db, actorOf(a), assignmentId);
  done();
}

/* Notes and attachments */
export async function saveNoteAction(studentId: number, noteId: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveNote(db, actorOf(a), studentId, String(fd.get('body') ?? ''), noteId);
  if (!r.ok) return { errors: { body: r.error } };
  done();
  return { ok: true, message: 'Note saved.' };
}
export async function deleteNoteAction(studentId: number, noteId: number) {
  const a = await requireAdmin('delete');
  await deleteNote(db, actorOf(a), studentId, noteId);
  done();
}

export async function uploadAttachmentAction(studentId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  await takeUploads(fd); // the file came up first, with progress (FileDrop)
  const f = fd.get('file');
  if (!(f instanceof File) || !f.size) return { errors: { file: 'Choose a file' } };
  const allowed = (await readTab(db, 'storage')).allowedExtensions as string[];
  const r = await storeAttachment(db, f, allowed, 'student-file', a.identityId);
  if (!r.ok) return { errors: { file: r.error } };
  await db.insert(studentFile).values({ studentId, fileId: r.file.id });
  done();
  return { ok: true, message: 'File added.' };
}

export async function deleteAttachmentAction(studentId: number, fileId: string) {
  await requireAdmin('delete');
  const [f] = await db.select().from(fileObject).innerJoin(studentFile, eq(studentFile.fileId, fileObject.id))
    .where(and(eq(studentFile.studentId, studentId), eq(fileObject.id, fileId))).limit(1);
  if (!f) return;
  await db.delete(fileObject).where(eq(fileObject.id, fileId));
  await removeStored(f.file_object.storageKey);
  done();
}

/* Contacts on a student / Parent portal access */
export async function linkContactAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await linkContact(db, actorOf(a), formObject(fd));
  if (!r.ok) return { message: r.error };
  done('/admin');
  return { ok: true, message: 'Contact linked.' };
}
export async function unlinkContactAction(studentId: number, contactId: number) {
  const a = await requireAdmin('edit');
  await unlinkContact(db, actorOf(a), studentId, contactId);
  done('/admin');
}
export async function setLinkFlagsAction(studentId: number, contactId: number, flags: { isPrimary?: boolean; portalAccess?: boolean }) {
  const a = await requireAdmin('edit');
  await setLinkFlags(db, actorOf(a), studentId, contactId, flags);
  done('/admin');
}
export async function setBlockedAction(contactId: number, blocked: boolean) {
  const a = await requireAdmin('edit');
  await setContactBlocked(db, actorOf(a), contactId, blocked);
  done('/admin');
}

/* Siblings */
export async function addSiblingAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await addSibling(db, actorOf(a), Number(fd.get('a')), Number(fd.get('b')));
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: 'Sibling relation added.' };
}
export async function removeSiblingAction(x: number, y: number) {
  const a = await requireAdmin('edit');
  await removeSibling(db, actorOf(a), x, y);
  done();
}
export async function autoSiblingsAction(includeAll: boolean) {
  const a = await requireAdmin('edit');
  const found = await findSiblings(db, includeAll);
  const n = await saveFoundSiblings(db, actorOf(a), found.map((f) => [f.a, f.b]));
  done();
  return { error: n ? undefined : 'No new sibling relations were found.' };
}

/* Walk-home consent */
export async function setConsentAction(studentId: number, given: boolean) {
  const a = await requireAdmin('edit');
  await setConsent(db, actorOf(a), studentId, given);
  done();
}
