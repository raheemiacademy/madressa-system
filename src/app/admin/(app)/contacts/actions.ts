'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { copyAddressToStudents, deleteContact, listContacts, massAssign, saveContact } from '@/server/people/contacts';

export async function searchContactsAction(q: string) {
  await requireAdmin();
  const { rows } = await listContacts(db, { q: String(q).slice(0, 100), page: 1, perPage: 12 });
  return rows.map((r) => ({ id: r.c.id, label: [r.c.name, r.c.email ?? r.c.mobile].filter(Boolean).join(' · ') }));
}

export async function saveContactAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveContact(db, actorOf(a), { ...formObject(fd), groups: fd.getAll('groups').map(String) }, fd, id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin', 'layout');
  redirect(`/admin/contacts/${r.id}`);
}

export async function deleteContactAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteContact(db, actorOf(a), id);
  revalidatePath('/admin', 'layout');
  redirect('/admin/contacts');
}

export async function copyAddressAction(contactId: number, studentId?: number) {
  const a = await requireAdmin('edit');
  const n = await copyAddressToStudents(db, actorOf(a), contactId, studentId ? [studentId] : undefined);
  revalidatePath('/admin', 'layout');
  return { error: n ? undefined : 'No linked students to update.' };
}

export async function massAssignAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await massAssign(db, actorOf(a), { ...formObject(fd), contactIds: fd.getAll('contactIds').map(String) });
  if (!r.ok) return { message: r.error };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Link settings updated.' };
}
