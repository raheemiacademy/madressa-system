'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import type { FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { addDoc, deleteDoc } from '@/server/portal/docs';

export async function addDocAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const f = fd.get('file');
  const r = await addDoc(db, actorOf(a), { title: fd.get('title'), audience: fd.get('audience'), classIds: fd.getAll('classIds') }, f instanceof File ? f : null);
  if (!r.ok) return { ok: false, errors: r.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin/docs');
  return { ok: true, message: 'Shared.' };
}

export async function deleteDocAction(id: number) {
  const a = await requireAdmin('delete');
  const r = await deleteDoc(db, actorOf(a), id);
  revalidatePath('/admin/docs');
  return r.ok ? undefined : { error: r.error };
}
