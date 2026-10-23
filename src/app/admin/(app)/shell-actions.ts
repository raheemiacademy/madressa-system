'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { addNote, deleteNote, notesForPage, updateNote } from '@/server/sticky-notes';

export async function chooseYear(id: number) {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return;
  (await cookies()).set('year_id', String(id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/admin', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/admin', 'layout');
}

export async function loadNotes(pagePath: string) {
  const a = await requireAdmin();
  if (!/^\/admin(\/[\w\-/]*)?$/.test(pagePath)) return [];
  return (await notesForPage(db, pagePath)).map((n) => ({ id: n.id, body: n.body, colour: n.colour, canChange: a.staff.isSuper || n.createdBy === a.identityId }));
}

export async function addNoteAction(input: { pagePath: string; body: string; colour: string }) {
  const a = await requireAdmin();
  const r = await addNote(db, { identityId: a.identityId, isSuper: a.staff.isSuper }, input);
  revalidatePath('/admin/tools/sticky-notes');
  return r;
}

export async function updateNoteAction(id: number, body: string) {
  const a = await requireAdmin();
  return updateNote(db, { identityId: a.identityId, isSuper: a.staff.isSuper }, id, body);
}

export async function deleteNoteAction(id: number) {
  const a = await requireAdmin();
  const r = await deleteNote(db, { identityId: a.identityId, isSuper: a.staff.isSuper }, id);
  revalidatePath('/admin/tools/sticky-notes');
  return r;
}
