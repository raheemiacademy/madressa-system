'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { deleteCategory, lockTopic, post, removePost, saveCategory } from '@/server/learning/forums';

const done = () => revalidatePath('/admin/forums', 'layout');

export async function saveCategoryAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveCategory(db, actorOf(a), { ...formObject(fd), classIds: fd.getAll('classIds').map(String) }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Category saved.' };
}

export async function deleteCategoryAction(id: number) {
  const a = await requireAdmin('delete');
  await deleteCategory(db, actorOf(a), id);
  done();
  redirect('/admin/forums');
}

export async function newTopicAction(categoryId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await post(db, { kind: 'admin', id: a.staff.id, name: a.name }, { categoryId, title: String(fd.get('title') ?? '') }, String(fd.get('body') ?? ''));
  if (!r.ok) return { message: r.error };
  done();
  redirect(`/admin/forums/topic/${r.topicId}`);
}

export async function replyAction(topicId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await post(db, { kind: 'admin', id: a.staff.id, name: a.name }, { topicId }, String(fd.get('body') ?? ''));
  if (!r.ok) return { errors: { body: r.error }, message: r.error };
  done();
  return { ok: true, message: 'Posted.' };
}

export async function removePostAction(postId: number) {
  const a = await requireAdmin('edit');
  await removePost(db, actorOf(a), postId);
  done();
  return {};
}

export async function lockTopicAction(topicId: number, locked: boolean) {
  const a = await requireAdmin('edit');
  await lockTopic(db, actorOf(a), topicId, locked);
  done();
  return {};
}
