'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db';
import type { FormState } from '@/lib/validate';
import { resolveYear } from '@/server/academic-years';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { AREAS, restoreDefaultParagraphs, saveEntries, saveParagraphs, saveReport } from '@/server/learning/eoty';
import { takeUploads } from '@/server/uploads';

const done = () => revalidatePath('/admin', 'layout');
const lines = (v: FormDataEntryValue | null) => String(v ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export async function saveReportAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  if (!year) return { message: 'Add an academic year first.' };
  const on = (k: string) => fd.get(k) === 'on';
  const r = await saveReport(db, actorOf(a), year.id, {
    title: fd.get('title'), termStart: fd.get('termStart'), termEnd: fd.get('termEnd'), semesterId: fd.get('semesterId') ?? '',
    includeExams: on('includeExams'), includePositions: on('includePositions'), includeAttendance: on('includeAttendance'), includeHomework: on('includeHomework'),
    scoring: on('scoring'), active: on('active'), teachersCanDownload: on('teachersCanDownload'), onPortal: on('onPortal'), scoreLabels: lines(fd.get('scoreLabels')), questions: lines(fd.get('questions'))
  }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  if (!id) redirect(`/admin/reports/${r.id}`);
  return { ok: true, message: 'Report saved.' };
}

/** Comment entry posts score.{studentId}.{n} and comment.{studentId} for each student shown. */
export async function entriesAction(reportId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const ids = fd.getAll('studentIds').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const rows = ids.map((sid) => ({
    studentId: sid,
    scores: [...fd.keys()].filter((k) => k.startsWith(`score.${sid}.`)).sort((x, y) => Number(x.split('.')[2]) - Number(y.split('.')[2])).map((k) => Number(fd.get(k)) || 0),
    comment: String(fd.get(`comment.${sid}`) ?? '')
  }));
  const r = await saveEntries(db, actorOf(a), reportId, rows);
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: 'Comments saved.' };
}

export async function paragraphsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  await takeUploads(fd); // the file came up first, with progress (FileDrop)
  const file = fd.get('backup');
  let raw: unknown;
  if (file instanceof File && file.size) {
    // Restoring a backup made with "Download backup".
    try { raw = JSON.parse(await file.text()); } catch { return { message: 'That file isn’t a paragraph backup.' }; }
  } else raw = Object.fromEntries(AREAS.map((area) => [area, [1, 2, 3, 4, 5].map((l) => String(fd.get(`${area}.${l}`) ?? ''))]));
  const r = await saveParagraphs(db, actorOf(a), raw);
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: file instanceof File && file.size ? 'Backup restored.' : 'Paragraphs saved.' };
}

export async function restoreDefaultsAction() {
  const a = await requireAdmin('edit');
  await restoreDefaultParagraphs(db, actorOf(a));
  done();
  return { message: 'Default paragraphs restored.' };
}
