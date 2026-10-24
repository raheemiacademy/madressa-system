'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { resolveYear } from '@/server/academic-years';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { deleteEvent, recordOptIn, saveEvent, withdrawOptIn } from '@/server/learning/events';

const done = () => revalidatePath('/admin', 'layout');
const json = (v: FormDataEntryValue | null) => { try { return JSON.parse(String(v ?? '[]')); } catch { return []; } };

export async function saveEventAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  if (!year) return { message: 'Add an academic year first.' };
  const r = await saveEvent(db, actorOf(a), year.id, { ...formObject(fd), classIds: fd.getAll('classIds').map(String), consents: json(fd.get('consents')), prices: json(fd.get('prices')), slots: json(fd.get('slots')) }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: Object.values(r.errors)[0] ?? 'Check the highlighted fields.' };
  done();
  if (!id) redirect(`/admin/events/${r.id}`);
  return { ok: true, message: r.kept ? 'Saved. Consents, prices and timeslots weren’t changed because families have already opted in.' : 'Event saved.' };
}

export async function deleteEventAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteEvent(db, actorOf(a), id);
  done();
  redirect('/admin/events');
}

export async function optInAction(eventId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await recordOptIn(db, actorOf(a), eventId, { studentId: fd.get('studentId'), timeslotId: fd.get('timeslotId') ?? '', consentIds: fd.getAll('consentIds').map(String), priceIds: fd.getAll('priceIds').map(String) });
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: r.invoiced ? 'Opted in and invoiced.' : 'Opted in.' };
}

export async function withdrawAction(eventId: number, studentId: number) {
  const a = await requireAdmin('edit');
  const r = await withdrawOptIn(db, actorOf(a), eventId, studentId);
  done();
  return r.ok ? { message: r.kept ? 'Withdrawn. The invoice was kept because payments are recorded.' : 'Withdrawn.' } : { error: r.error };
}
