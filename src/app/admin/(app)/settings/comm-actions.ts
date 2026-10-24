'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { deleteQueued, sendNow } from '@/server/comm/mail';
import { resetTemplate, saveTemplate } from '@/server/comm/templates';

const done = () => revalidatePath('/admin', 'layout');

/** §19 Mail Queue Manager: Send Now or Delete the chosen queued (or failed) emails. */
export async function queueAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const ids = fd.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { message: 'Tick at least one email.' };
  const op = fd.get('op');
  const n = op === 'delete' ? await deleteQueued(db, actorOf(a), ids) : await sendNow(db, actorOf(a), ids);
  done();
  return { ok: true, message: `${op === 'delete' ? 'Deleted' : 'Sent'} ${n === 1 ? '1 email' : `${n} emails`}.` };
}

export async function saveTemplateAction(key: string, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const r = await saveTemplate(db, actorOf(a), key, formObject(fd));
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  redirect(`/admin/settings/templates/${encodeURIComponent(key)}?version=${encodeURIComponent(String(fd.get('version')))}`);
}

export async function resetTemplateAction(key: string, version: string) {
  const a = await requireAdmin('super');
  await resetTemplate(db, actorOf(a), key, version);
  done();
  redirect(`/admin/settings/templates/${encodeURIComponent(key)}`);
}
