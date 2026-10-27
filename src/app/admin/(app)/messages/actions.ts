'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { asc, ilike, or } from 'drizzle-orm';
import { db } from '@/db';
import { contact } from '@/db/schema';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { bulkThreads, compose, deleteMessage, deleteRange, reply } from '@/server/comm/messages';
import { readTab } from '@/server/settings';
import { storeAttachment } from '@/server/storage';

const done = () => revalidatePath('/admin', 'layout');
const actor = (a: Awaited<ReturnType<typeof requireAdmin>>) => ({ ...actorOf(a), staffId: a.staff.id });

async function attachment(fd: FormData, identityId: number): Promise<{ id: string | null } | { error: string }> {
  const f = fd.get('attachment');
  if (!(f instanceof File) || !f.size) return { id: null };
  const r = await storeAttachment(db, f, (await readTab(db, 'storage')).allowedExtensions as string[], 'message', identityId);
  return r.ok ? { id: r.file.id } : { error: r.error };
}

/** Compose: contacts picked in the search come in as contactIds; Send & Lock sends lock=1. */
export async function composeAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const att = await attachment(fd, a.identityId);
  if ('error' in att) return { errors: { attachment: att.error }, message: 'Check the attachment.' };
  const all = (k: string) => fd.getAll(k).map(String);
  const r = await compose(db, actor(a), { ...formObject(fd), teacherIds: all('teacherIds'), staffIds: all('staffIds'), contactIds: all('contactIds'), classIds: all('classIds'), lock: fd.get('lock') === '1' }, att.id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  redirect(r.ids.length === 1 ? `/admin/messages?t=${r.ids[0]}` : '/admin/messages');
}

export async function replyAction(threadId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const att = await attachment(fd, a.identityId);
  if ('error' in att) return { errors: { attachment: att.error }, message: 'Check the attachment.' };
  const r = await reply(db, { kind: 'admin', id: a.staff.id, name: a.name }, threadId, String(fd.get('body') ?? ''), { lock: fd.get('lock') === '1', attachmentFileId: att.id, actor: actorOf(a) });
  if (!r.ok) return { errors: { body: r.error }, message: r.error };
  done();
  return { ok: true, message: fd.get('lock') === '1' ? 'Reply sent and conversation locked.' : 'Reply sent.' };
}

export async function bulkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const op = String(fd.get('op'));
  if (!['read', 'unread', 'lock', 'unlock', 'delete'].includes(op)) return { message: 'Choose what to do.' };
  const a = await requireAdmin(op === 'delete' ? 'delete' : 'edit');
  const ids = fd.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { message: 'Tick at least one conversation.' };
  const n = await bulkThreads(db, actor(a), ids, op as 'read');
  done();
  return { ok: true, message: `Updated ${n === 1 ? '1 conversation' : `${n} conversations`}.` };
}

export async function deleteRangeAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('delete');
  const r = await deleteRange(db, actorOf(a), formObject(fd));
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: `Deleted ${r.n === 1 ? '1 message' : `${r.n} messages`}.` };
}

/** Contact search for compose and Send SMS (any signed-in admin can already see contacts). */
export async function findContactsAction(q: string) {
  await requireAdmin();
  const s = q.trim().slice(0, 60);
  if (s.length < 2) return [];
  return db.select({ id: contact.id, name: contact.name, email: contact.email }).from(contact).where(or(ilike(contact.name, `%${s}%`), ilike(contact.email, `%${s}%`))).orderBy(asc(contact.name)).limit(12);
}

/** Delete one message (admins with Delete access). */
export async function deleteMessageAction(id: number): Promise<{ error?: string } | void> {
  const a = await requireAdmin('delete');
  if (!(await deleteMessage(db, actorOf(a), id))) return { error: 'That message has already gone.' };
  done();
}

/** Delete a whole conversation from its page, then go back to the inbox. */
export async function deleteThreadAction(id: number) {
  const a = await requireAdmin('delete');
  await bulkThreads(db, actor(a), [id], 'delete');
  done();
  redirect('/admin/messages');
}
