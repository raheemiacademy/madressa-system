'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { deleteYear, saveYear, setCurrentYear } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';

const actorOf = (a: { identityId: number; name: string }) => ({ identityId: a.identityId, name: a.name });

export async function saveYearAction(id: number | undefined, _prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin('super');
  const res = await saveYear(db, actorOf(admin), formObject(fd), id);
  if (!res.ok) return { errors: res.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin', 'layout');
  if (id) redirect('/admin/settings/years');
  return { ok: true, message: 'Year added.' };
}

export async function setCurrentAction(id: number) {
  const admin = await requireAdmin('super');
  await setCurrentYear(db, actorOf(admin), id);
  revalidatePath('/admin', 'layout');
}

export async function deleteYearAction(id: number): Promise<{ error?: string }> {
  const admin = await requireAdmin('super');
  const r = await deleteYear(db, actorOf(admin), id);
  revalidatePath('/admin', 'layout');
  return r.ok ? {} : { error: r.error };
}
