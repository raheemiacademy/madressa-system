'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { copyClassesToYear, migrateStudents } from '@/server/people/classes';
import { copyStructures } from '@/server/fees/structures';
import { deleteField, saveField } from '@/server/people/custom-fields';
import { deleteYearGroup, saveYearGroup } from '@/server/people/year-groups';

const done = () => revalidatePath('/admin', 'layout');

export async function saveYearGroupAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const r = await saveYearGroup(db, actorOf(a), formObject(fd), id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Saved.' };
}
export async function deleteYearGroupAction(id: number) {
  const a = await requireAdmin('super');
  await deleteYearGroup(db, actorOf(a), id);
  done();
}

export async function saveFieldAction(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const r = await saveField(db, actorOf(a), formObject(fd), id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Saved.' };
}
export async function deleteFieldAction(id: number) {
  const a = await requireAdmin('super');
  await deleteField(db, actorOf(a), id);
  done();
}

export async function copyClassesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const from = Number(fd.get('fromYearId')), to = Number(fd.get('toYearId'));
  if (!from || !to || from === to) return { errors: { toYearId: 'Choose two different years' } };
  const n = await copyClassesToYear(db, actorOf(a), from, to, { timings: fd.get('timings') === 'on', teachers: fd.get('teachers') === 'on' });
  done();
  return { ok: true, message: n ? `Copied ${n === 1 ? '1 class' : `${n} classes`}.` : 'No new classes to copy: they already exist in the new year.' };
}

export async function copyFeesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const from = Number(fd.get('fromYearId')), to = Number(fd.get('toYearId'));
  if (!from || !to || from === to) return { message: 'Choose two different years.' };
  const n = await copyStructures(db, actorOf(a), from, to);
  done();
  return { ok: true, message: n ? `Copied ${n === 1 ? '1 fees structure' : `${n} fees structures`}.` : 'No structures to copy: the new year already has them.' };
}

export async function migrateStudentsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const from = Number(fd.get('fromYearId')), to = Number(fd.get('toYearId'));
  if (!from || !to || from === to) return { message: 'Choose two different years.' };
  const mapping: Record<number, number | null> = {};
  for (const k of fd.keys()) {
    const m = /^map\.(\d+)$/.exec(k);
    if (m) { const v = String(fd.get(k)); if (v !== 'skip') mapping[Number(m[1])] = v === 'none' ? null : Number(v); }
  }
  const n = await migrateStudents(db, actorOf(a), from, to, mapping);
  done();
  return { ok: true, message: `Moved ${n === 1 ? '1 student' : `${n} students`}.` };
}
