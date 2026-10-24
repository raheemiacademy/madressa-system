'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { deleteHoliday, saveHoliday } from '@/server/holidays';
import { requireAdmin } from '@/server/next/actor';

export async function saveHolidayAction(id: number | undefined, _prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin('super');
  const classIds = fd.getAll('classIds').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const res = await saveHoliday(db, { identityId: admin.identityId, name: admin.name }, formObject(fd), id, classIds);
  if (!res.ok) return { errors: res.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin/settings/holidays');
  if (id) redirect('/admin/settings/holidays');
  return { ok: true, message: 'Holiday added.' };
}

export async function deleteHolidayAction(id: number) {
  const admin = await requireAdmin('super');
  await deleteHoliday(db, { identityId: admin.identityId, name: admin.name }, id);
  revalidatePath('/admin/settings/holidays');
}
