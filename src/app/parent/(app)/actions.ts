'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import type { FormState } from '@/lib/validate';
import { createHolidayRequest, createNotice } from '@/server/attendance/requests';
import { reply, startFromPortal } from '@/server/comm/messages';
import { recordOptIn, withdrawOptIn } from '@/server/learning/events';
import { post } from '@/server/learning/forums';
import { createSale } from '@/server/learning/products';
import { requireParent } from '@/server/next/portal';
import { childOf, PortalDenied } from '@/server/portal/access';
import { collectDirectDebits, payOptions, startCardPayment, startDirectDebit } from '@/server/portal/fees';
import { parseRecipient, recipientsFor } from '@/server/portal/messages';
import { confirmDetails, removeHomeworkUpload, setWalkHome, uploadHomework } from '@/server/portal/parent';
import { visibleCategory, visibleTopic } from '@/server/portal/shared';
import { todayIso } from '@/server/people/common';

/* §20 Parent portal actions. Each one checks the session, the section and the child again: what the page showed is never trusted. */

const id = (v: FormDataEntryValue | null) => Number(v) || 0;
const denied = (e: unknown): FormState => { if (e instanceof PortalDenied) return { ok: false, message: 'You can’t do that for this child.' }; throw e; };

export async function noticeAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent('Attendance');
  try {
    const kid = childOf(p.ctx, id(fd.get('studentId')));
    const r = await createNotice(db, p.ctx.contact.id, { studentId: kid.id, kind: fd.get('kind'), date: fd.get('date') || todayIso(), expectedArrival: fd.get('expectedArrival') ?? '', reason: fd.get('reason') ?? '' });
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath('/parent/attendance');
    return { ok: true, message: `Sent. ${kid.label}’s teacher and the office will see it.` };
  } catch (e) { return denied(e); }
}

export async function holidayAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent('Holiday Requests');
  try {
    const ids = fd.getAll('studentIds').map((v) => childOf(p.ctx, id(v)).id);
    const r = await createHolidayRequest(db, p.ctx.contact.id, { studentIds: ids, startsOn: fd.get('startsOn'), endsOn: fd.get('endsOn'), request: fd.get('request') });
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath('/parent/attendance');
    return { ok: true, message: 'Request sent. The office will reply here and by email.' };
  } catch (e) { return denied(e); }
}

export async function payByCardAction(): Promise<{ error?: string } | void> {
  const p = await requireParent('Fees');
  const r = await startCardPayment(db, p.actor, p.ctx);
  if (!r.ok) return { error: r.error };
  redirect(r.url);
}

export async function setUpDirectDebitAction(): Promise<{ error?: string } | void> {
  const p = await requireParent('Fees');
  const r = await startDirectDebit(db, p.actor, p.ctx);
  if (!r.ok) return { error: r.error };
  redirect(r.url);
}

export async function payByDirectDebitAction(): Promise<{ error?: string; message?: string } | void> {
  const p = await requireParent('Fees');
  const o = await payOptions(db, p.ctx);
  if (!o.mandate || !['pending_submission', 'submitted', 'active'].includes(o.mandate.status)) return { error: 'Set up a direct debit first' };
  const n = await collectDirectDebits(db, p.actor, { contactId: p.ctx.contact.id });
  revalidatePath('/parent/fees');
  return n ? { message: `Requested ${n === 1 ? '1 payment' : `${n} payments`} by direct debit. They take a few working days to clear.` } : { error: 'There’s nothing to pay' };
}

export async function uploadHomeworkAction(studentId: number, homeworkId: number, _: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent('Homework');
  try {
    const f = fd.get('file');
    const r = await uploadHomework(db, p.actor, p.ctx, studentId, homeworkId, f instanceof File ? f : null);
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath('/parent/homework');
    return { ok: true, message: 'Handed in.' };
  } catch (e) { return denied(e); }
}

export async function removeUploadAction(studentId: number, homeworkId: number) {
  const p = await requireParent('Homework');
  const r = await removeHomeworkUpload(db, p.actor, p.ctx, studentId, homeworkId).catch((e) => { if (e instanceof PortalDenied) return { ok: false as const, error: 'Not allowed' }; throw e; });
  revalidatePath('/parent/homework');
  return r.ok ? undefined : { error: r.error };
}

export async function optInAction(eventId: number, _: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent('Events');
  try {
    const kid = childOf(p.ctx, id(fd.get('studentId')));
    const r = await recordOptIn(db, p.actor, eventId, { studentId: kid.id, timeslotId: fd.get('timeslotId') ?? '', consentIds: fd.getAll('consentIds'), priceIds: fd.getAll('priceIds') }, 'portal');
    if (!r.ok) return { ok: false, message: r.error };
    revalidatePath('/parent/events');
    return { ok: true, message: r.invoiced ? 'You’re in. The cost has been added to your fees.' : 'You’re in.' };
  } catch (e) { return denied(e); }
}

export async function withdrawAction(eventId: number, studentId: number) {
  const p = await requireParent('Events');
  childOf(p.ctx, studentId);
  const r = await withdrawOptIn(db, p.actor, eventId, studentId);
  revalidatePath('/parent/events');
  return r.ok ? undefined : { error: r.error };
}

export async function buyAction(productId: number, _: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent('Products');
  try {
    const kid = childOf(p.ctx, id(fd.get('studentId')));
    const r = await createSale(db, p.actor, { productId, target: 'student', studentId: kid.id, qty: fd.get('qty') || 1, pay: fd.get('pay') === 'merits' ? 'merits' : 'invoice', soldOn: todayIso() });
    if (!r.ok) return { ok: false, message: Object.values(r.errors)[0] ?? 'Check the order', errors: r.errors };
    revalidatePath('/parent/shop');
    return { ok: true, message: fd.get('pay') === 'merits' ? 'Bought with merits. The school will hand it over.' : 'Ordered. The cost has been added to your fees.' };
  } catch (e) { return denied(e); }
}

export async function confirmDetailsAction(studentId: number) {
  const p = await requireParent();
  const r = await confirmDetails(db, p.actor, p.ctx, studentId).catch((e) => { if (e instanceof PortalDenied) return { ok: false as const, error: 'Not allowed' }; throw e; });
  revalidatePath('/parent', 'layout');
  return r.ok ? { message: 'Thank you. Details confirmed.' } : { error: r.error };
}

export async function walkHomeAction(studentId: number, give: boolean) {
  const p = await requireParent();
  const r = await setWalkHome(db, p.actor, p.ctx, studentId, give).catch((e) => { if (e instanceof PortalDenied) return { ok: false as const, error: 'Not allowed' }; throw e; });
  revalidatePath('/parent/child');
  return r.ok ? undefined : { error: r.error };
}

export async function newMessageAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent();
  const to = parseRecipient(String(fd.get('to') ?? ''));
  const allowed = await recipientsFor(db, p.party, p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c));
  if (!to || !allowed.some((a) => a.value === String(fd.get('to')))) return { ok: false, errors: { to: 'Choose who to write to' } };
  const r = await startFromPortal(db, p.party, to, String(fd.get('subject') ?? ''), String(fd.get('body') ?? ''));
  if (!r.ok) return { ok: false, message: r.error };
  redirect(`/parent/messages/${r.id}`);
}

export async function replyAction(threadId: number, _: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent();
  const r = await reply(db, p.party, threadId, String(fd.get('body') ?? ''));
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath(`/parent/messages/${threadId}`);
  return { ok: true, message: 'Sent.' };
}

export async function forumPostAction(where: { categoryId: number } | { topicId: number }, _: FormState, fd: FormData): Promise<FormState> {
  const p = await requireParent();
  const classIds = p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c);
  const ok = 'topicId' in where ? await visibleTopic(db, classIds, where.topicId) : await visibleCategory(db, classIds, where.categoryId);
  if (!ok) return { ok: false, message: 'This forum isn’t open to you.' };
  const r = await post(db, p.party, 'topicId' in where ? where : { categoryId: where.categoryId, title: String(fd.get('title') ?? '') }, String(fd.get('body') ?? ''));
  if (!r.ok) return { ok: false, message: r.error };
  if (!('topicId' in where)) redirect(`/parent/forums/topic/${r.topicId}`);
  revalidatePath(`/parent/forums/topic/${where.topicId}`);
  return { ok: true, message: 'Posted.' };
}
