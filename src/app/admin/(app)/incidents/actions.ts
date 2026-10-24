'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { deleteIncident, deleteIncidentTemplate, saveIncident, saveIncidentTemplate } from '@/server/learning/incidents';

const done = () => revalidatePath('/admin', 'layout');

export async function saveIncidentAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  // Texting contacts also needs the Send SMS level.
  if (fd.get('smsContacts') === 'on' && !(a.staff.isSuper || a.staff.sendSms)) return { errors: { smsContacts: 'Texting needs the Send SMS access level' }, message: 'Check the highlighted fields.' };
  const r = await saveIncident(db, actorOf(a), formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  redirect(`/admin/incidents?saved=${r.id}&emailed=${r.emailed}&texted=${r.texted}`);
}

export async function deleteIncidentAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteIncident(db, actorOf(a), id);
  done();
  redirect('/admin/incidents');
}

export async function saveTemplateAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveIncidentTemplate(db, actorOf(a), formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Template saved.' };
}

export async function deleteTemplateAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteIncidentTemplate(db, actorOf(a), id);
  done();
  return {};
}
