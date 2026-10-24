'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isNull } from 'drizzle-orm';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import type { FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { createKiosk, KIOSK_COOKIE, revokeKiosk, saveLogs } from '@/server/attendance/teacher-logs';
import { csvDate, parseCsv } from '@/server/people/csv';

/** Rows come in as row.<i>.<field>. */
function rowsFrom(fd: FormData) {
  const idx = [...new Set([...fd.keys()].map((k) => /^row\.(\d+)\./.exec(k)?.[1]).filter(Boolean))];
  return idx.map((i) => ({ teacherId: fd.get(`row.${i}.teacherId`), date: fd.get(`row.${i}.date`), timeIn: fd.get(`row.${i}.timeIn`) ?? '', timeOut: fd.get(`row.${i}.timeOut`) ?? '', absent: fd.get(`row.${i}.absent`) ?? '', note: fd.get(`row.${i}.note`) ?? '' }));
}

export async function saveLogsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const r = await saveLogs(db, actorOf(a), rowsFrom(fd));
  if (!r.ok) return { errors: r.errors, message: Object.values(r.errors)[0] };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: `Saved ${r.n === 1 ? '1 log' : `${r.n} logs`}.` };
}

/** CSV columns: teacher (name or ID), date (DD/MM/YYYY), time_in, time_out, absent. */
export async function importLogsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('edit');
  const f = fd.get('file');
  const text = f instanceof File && f.size ? (f.size > 2_000_000 ? '' : await f.text()) : String(fd.get('paste') ?? '');
  const parsed = parseCsv(text);
  if (parsed.error || !parsed.rows.length) return { message: parsed.error ?? 'No rows found. The first row must be the headings.' };
  const teachers = await db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt));
  const errors: string[] = [];
  const rows = parsed.rows.map((r, i) => {
    const t = teachers.find((x) => String(x.id) === r.teacher || x.name.toLowerCase() === (r.teacher ?? '').toLowerCase());
    const d = csvDate(r.date);
    if (!t) errors.push(`Line ${i + 2}: no teacher “${r.teacher ?? ''}”`);
    if (!d) errors.push(`Line ${i + 2}: date isn’t a real date`);
    return { teacherId: t?.id ?? 0, date: d || '', timeIn: r.time_in ?? '', timeOut: r.time_out ?? '', absent: /^(1|y|yes|true)$/i.test(r.absent ?? '') };
  });
  if (errors.length) return { message: errors.slice(0, 5).join('. ') + (errors.length > 5 ? ` …and ${errors.length - 5} more.` : '.') };
  const r = await saveLogs(db, actorOf(a), rows, 'import');
  if (!r.ok) return { message: Object.entries(r.errors).map(([k, v]) => `Line ${Number(k.split('.')[1]) + 2}: ${v}`).slice(0, 5).join('. ') };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: `Imported ${r.n === 1 ? '1 log' : `${r.n} logs`}.` };
}

/** Turns this browser into a kiosk: stores a device token in a long-lived cookie scoped to /kiosk. */
export async function setUpKioskAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const r = await createKiosk(db, actorOf(a), String(fd.get('name') ?? ''));
  if (!r.ok) return { errors: { name: r.error } };
  (await cookies()).set(KIOSK_COOKIE, r.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/kiosk', maxAge: 60 * 60 * 24 * 400 });
  revalidatePath('/admin/teacher-logs/kiosk');
  return { ok: true, message: 'This browser is now a kiosk. Open /kiosk on it.' };
}

export async function revokeKioskAction(id: number) {
  const a = await requireAdmin('super');
  await revokeKiosk(db, actorOf(a), id);
  revalidatePath('/admin/teacher-logs/kiosk');
}
