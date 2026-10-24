'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject, holiday, newsletter } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { formObject, type FormState } from '@/lib/validate';
import { audit } from '@/server/audit';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { enqueueMail } from '@/server/comm/mail';
import { renderNewsletter, saveNewsletter, sendNewsletter } from '@/server/comm/newsletters';
import { readTab } from '@/server/settings';
import { removeStored, storeAttachment, storeUpload } from '@/server/storage';
import { currentYear } from '@/server/academic-years';

const done = () => revalidatePath('/admin', 'layout');

export async function saveNewsletterAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('marketing');
  const r = await saveNewsletter(db, actorOf(a), { ...formObject(fd), classIds: fd.getAll('classIds').map(String), fileIds: fd.getAll('fileIds').map(String) }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  if (!id) redirect(`/admin/newsletters/${r.id}`);
  return { ok: true, message: 'Newsletter saved.' };
}

export async function sendNewsletterAction(id: number) {
  const a = await requireAdmin('marketing');
  const r = await sendNewsletter(db, actorOf(a), id);
  done();
  return r.ok ? { message: `Queued for ${r.n === 1 ? '1 person' : `${r.n} people`}.` } : { error: r.error };
}

/** Sends the newsletter only to the signed-in admin, to check it before it goes out. */
export async function sendTestAction(id: number) {
  const a = await requireAdmin('marketing');
  const [n] = await db.select().from(newsletter).where(eq(newsletter.id, id));
  if (!n) return { error: 'This newsletter no longer exists' };
  await enqueueMail(db, [{ to: a.email, toName: a.name, subject: `[Test] ${n.subject}`, html: await renderNewsletter(db, n, { name: a.name }), fromEmail: n.fromEmail, fromName: n.fromName, createdBy: a.identityId }]);
  return { message: `Test queued to ${a.email}.` };
}

export async function deleteNewsletterAction(id: number) {
  const a = await requireAdmin('marketing');
  const [n] = await db.delete(newsletter).where(eq(newsletter.id, id)).returning();
  if (n) await audit(db, actorOf(a), { action: `Deleted newsletter “${n.subject}”`, page: 'Newsletters', entity: 'newsletter', entityId: id });
  done();
  redirect('/admin/newsletters');
}

/** Image manager: images are checked by their bytes; other files must use the school's allowed extensions. Both are public (they're used in emails). */
export async function uploadFileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('marketing');
  const f = fd.get('file');
  if (!(f instanceof File) || !f.size) return { errors: { file: 'Choose a file' } };
  const image = /^image\//.test(f.type);
  const r = image ? await storeUpload(db, f, 'image', 'newsletter-image', a.identityId)
    : await storeAttachment(db, f, (await readTab(db, 'storage')).allowedExtensions as string[], 'newsletter-file', a.identityId);
  if (!r.ok) return { errors: { file: r.error } };
  await audit(db, actorOf(a), { action: `Uploaded newsletter file ${r.file.filename}`, page: 'Image manager', entity: 'file_object', entityId: r.file.id });
  done();
  return { ok: true, message: 'Uploaded.' };
}

export async function deleteFileAction(id: string) {
  const a = await requireAdmin('marketing');
  // Only newsletter media can be deleted here.
  const [f] = await db.delete(fileObject).where(and(eq(fileObject.id, id), inArray(fileObject.purpose, ['newsletter-image', 'newsletter-file']))).returning();
  if (f) {
    await removeStored(f.storageKey).catch(() => {});
    await audit(db, actorOf(a), { action: `Deleted newsletter file ${f.filename}`, page: 'Image manager', entity: 'file_object', entityId: id });
  }
  done();
  return {};
}

/** §3 "Send Holidays Newsletter": a draft newsletter listing this year's holidays, ready to edit and send. */
export async function holidayNewsletterAction() {
  const a = await requireAdmin('marketing');
  const year = await currentYear(db);
  if (!year) return { error: 'Add an academic year first.' };
  const rows = await db.select().from(holiday).where(inArray(holiday.academicYearId, [year.id])).orderBy(asc(holiday.startsOn));
  const list = rows.map((h) => `<li><strong>${h.title.replace(/[<>&]/g, '')}</strong>: ${formatCalendarDate(h.startsOn)}${h.endsOn !== h.startsOn ? ` to ${formatCalendarDate(h.endsOn)}` : ''}</li>`).join('');
  const r = await saveNewsletter(db, actorOf(a), { subject: `Holidays ${year.title}`, audience: 'parents', style: 'modern', body: `<p>Dear parents,</p><p>These are the holidays for ${year.title}:</p><ul>${list || '<li>No holidays set yet.</li>'}</ul>` });
  if (!r.ok) return { error: 'The draft couldn’t be made.' };
  redirect(`/admin/newsletters/${r.id}`);
}
