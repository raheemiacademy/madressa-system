'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { requireAdmin } from '@/server/next/actor';
import { deleteStaff, saveStaff } from '@/server/staff';

const actorOf = (a: { identityId: number; name: string; staff: { id: number } }) => ({ identityId: a.identityId, name: a.name, staffId: a.staff.id });

export async function saveStaffAction(id: number | undefined, _prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin('super');
  const res = await saveStaff(db, actorOf(admin), formObject(fd), id);
  if (!res.ok) return { errors: res.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin/settings/staff');
  redirect('/admin/settings/staff');
}

export async function deleteStaffAction(id: number): Promise<{ error?: string }> {
  const admin = await requireAdmin('super');
  const r = await deleteStaff(db, actorOf(admin), id);
  revalidatePath('/admin/settings/staff');
  return r.ok ? {} : { error: r.error };
}
