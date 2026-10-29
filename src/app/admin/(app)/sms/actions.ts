'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { csvRecipients, deleteSmsTemplate, GROUPS, groupRecipients, queueSms, saveSmsTemplate, type Group } from '@/server/comm/sms';
import { takeUploads } from '@/server/uploads';

const done = () => revalidatePath('/admin', 'layout');
const ids = (fd: FormData, k: string) => fd.getAll(k).map(Number).filter((n) => Number.isInteger(n) && n > 0);

/** §11 Send SMS: a group (or classes, or chosen contacts) plus any CSV numbers, queued for the worker to send. */
export async function sendSmsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('sms');
  const group = String(fd.get('group') ?? '');
  const people = group in GROUPS ? await groupRecipients(db, group as Group, { classIds: ids(fd, 'classIds'), contactIds: ids(fd, 'contactIds') }) : [];
  await takeUploads(fd); // the file came up first, with progress (FileDrop)
  const file = fd.get('csv');
  const csv = `${String(fd.get('paste') ?? '')}\n${file instanceof File && file.size && file.size < 1_000_000 ? await file.text() : ''}`;
  const all = [...people, ...csvRecipients(csv)];
  if (!all.length) return { errors: { group: 'Choose who to send to, or add numbers' }, message: 'Nobody to send to.' };
  const r = await queueSms(db, actorOf(a), all, formObject(fd));
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: `Queued ${r.n === 1 ? '1 text' : `${r.n} texts`}${r.skipped ? `; ${r.skipped} skipped (no mobile number or a duplicate)` : ''}.` };
}

export async function saveSmsTemplateAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('sms');
  const r = await saveSmsTemplate(db, actorOf(a), formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Template saved.' };
}

export async function deleteSmsTemplateAction(id: number) {
  const a = await requireAdmin('sms');
  await deleteSmsTemplate(db, actorOf(a), id);
  done();
  return {};
}
