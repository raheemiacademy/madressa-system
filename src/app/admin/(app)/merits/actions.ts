'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { awardMerits, deleteAwards, issueCertificates, saveAchievement, saveCertificateTemplate, saveCompetition, saveMerit, saveTeam } from '@/server/learning/merits';
import { createSale, markDelivered, saveProduct } from '@/server/learning/products';
import { storeUpload } from '@/server/storage';

const done = () => revalidatePath('/admin', 'layout');
const all = (fd: FormData, k: string) => fd.getAll(k).map(String);
const ids = (fd: FormData, k = 'ids') => fd.getAll(k).map(Number).filter((n) => Number.isInteger(n) && n > 0);
type R = { ok: true } | { ok: false; errors: Record<string, string> };
const result = (r: R | { ok: true; n?: number }, message: string): FormState => (r.ok ? { ok: true, message } : { errors: r.errors, message: 'Check the highlighted fields.' });

export async function awardAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await awardMerits(db, actorOf(a), { ...formObject(fd), studentIds: all(fd, 'studentIds'), teacherIds: all(fd, 'teacherIds') });
  if (r.ok) done();
  return result(r, r.ok ? `Awarded to ${r.n === 1 ? '1 person' : `${r.n} people`}.` : '');
}

export async function deleteAwardsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('delete');
  const n = await deleteAwards(db, actorOf(a), ids(fd));
  done();
  return n ? { ok: true, message: `Deleted ${n === 1 ? '1 award' : `${n} awards`}.` } : { message: 'Tick at least one award.' };
}

export async function saveMeritAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveMerit(db, actorOf(a), formObject(fd), id ?? undefined);
  if (r.ok) done();
  return result(r, 'Merit saved.');
}

export async function saveAchievementAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveAchievement(db, actorOf(a), formObject(fd), id ?? undefined);
  if (r.ok) done();
  return result(r, 'Saved.');
}

export async function issueAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await issueCertificates(db, actorOf(a), { ...formObject(fd), studentIds: all(fd, 'studentIds') });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: `Issued ${r.ids.length === 1 ? '1 certificate' : `${r.ids.length} certificates`}.` };
}

/** Certificate templates: an uploaded PDF background (checked by its bytes) and where each item is printed. */
export async function saveTemplateAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  let fileId: string | undefined;
  const f = fd.get('file');
  if (f instanceof File && f.size) {
    const up = await storeUpload(db, f, 'pdf', 'certificate-template', a.identityId);
    if (!up.ok) return { errors: { file: up.error }, message: 'Check the file.' };
    fileId = up.file.id;
  }
  const layout = Object.fromEntries(['name', 'achievement', 'badge', 'address', 'date'].map((k) => [k, { x: fd.get(`${k}.x`), y: fd.get(`${k}.y`), size: fd.get(`${k}.size`) }]));
  const r = await saveCertificateTemplate(db, actorOf(a), { name: fd.get('name'), size: fd.get('size'), orientation: fd.get('orientation'), layout }, fileId, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Template saved.' };
}

export async function saveTeamAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveTeam(db, actorOf(a), { ...formObject(fd), classIds: all(fd, 'classIds'), studentIds: all(fd, 'studentIds') }, id ?? undefined);
  if (r.ok) done();
  return result(r, 'Team saved.');
}

export async function saveCompetitionAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveCompetition(db, actorOf(a), formObject(fd), id ?? undefined);
  if (r.ok) done();
  return result(r, 'Competition saved.');
}

export async function saveProductAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  let imageFileId: string | undefined;
  const f = fd.get('image');
  if (f instanceof File && f.size) {
    const up = await storeUpload(db, f, 'image', 'product-image', a.identityId);
    if (!up.ok) return { errors: { image: up.error }, message: 'Check the image.' };
    imageFileId = up.file.id;
  }
  const r = await saveProduct(db, actorOf(a), formObject(fd), imageFileId, id ?? undefined);
  if (r.ok) done();
  return result(r, 'Product saved.');
}

/** A sale paid by invoice raises a fees invoice, so it also needs Access Fees Area. */
export async function saleAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  if (fd.get('pay') === 'invoice' && !adminCan(a.staff, 'fees')) return { errors: { pay: 'Invoicing needs the Access Fees Area level' }, message: 'Check the highlighted fields.' };
  const r = await createSale(db, actorOf(a), formObject(fd));
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: `Sold to ${r.n === 1 ? '1 buyer' : `${r.n} buyers`}.` };
}

export async function deliveredAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const chosen = ids(fd);
  if (!chosen.length) return { message: 'Tick at least one sale.' };
  const n = await markDelivered(db, actorOf(a), chosen, fd.get('op') !== 'undelivered');
  done();
  return { ok: true, message: `Updated ${n === 1 ? '1 sale' : `${n} sales`}.` };
}
