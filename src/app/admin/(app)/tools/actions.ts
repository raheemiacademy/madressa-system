'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import type { FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { createBackup, deleteOldBackups, restoreBackup } from '@/server/ops/backup';
import { deleteAllLogs } from '@/server/ops/logs';
import { createApiKey, deleteMailBefore, resetFeed, revokeApiKey } from '@/server/ops/system';
import { confirmsSchoolName } from '@/server/profile';

/* §3/§19 System tools. Super access only; restore and bulk deletes need the school name typed, and are audited. */

const nameError: FormState = { ok: false, errors: { confirmName: 'Type the school name exactly as it appears in the school profile' }, message: 'Nothing was changed.' };
const typed = (fd: FormData) => confirmsSchoolName(db, String(fd.get('confirmName') ?? ''));

export async function backupNowAction(): Promise<{ error?: string; message?: string }> {
  const a = await requireAdmin('super');
  const r = await createBackup(db, a.name, 'manual');
  revalidatePath('/admin/tools/backups');
  return r.ok ? { message: 'Backup made.' } : { error: r.error };
}

export async function restoreAction(id: number, _: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  if (!(await typed(fd))) return nameError;
  const r = await restoreBackup(db, actorOf(a), id);
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Restored. Everyone, including you, has been signed out.' };
}

export async function deleteOldBackupsAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  if (!(await typed(fd))) return nameError;
  const n = await deleteOldBackups(db, actorOf(a));
  revalidatePath('/admin/tools/backups');
  return { ok: true, message: n ? `Deleted ${n === 1 ? '1 backup' : `${n} backups`}.` : 'No backups are older than 30 days.' };
}

export async function deleteLogsAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  if (!(await typed(fd))) return nameError;
  const n = await deleteAllLogs(db, actorOf(a));
  revalidatePath('/admin/tools/logs');
  return { ok: true, message: `Deleted ${n === 1 ? '1 log line' : `${n} log lines`}. The audit trail was kept.` };
}

export async function deleteMailAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const date = String(fd.get('before') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, errors: { before: 'Choose a date' } };
  if (!(await typed(fd))) return nameError;
  const n = await deleteMailBefore(db, actorOf(a), date);
  revalidatePath('/admin/tools/email');
  return { ok: true, message: `Deleted ${n === 1 ? '1 sent email' : `${n} sent emails`}.` };
}

export async function resetFeedAction(): Promise<{ error?: string; message?: string }> {
  const a = await requireAdmin('super');
  await resetFeed(db, actorOf(a));
  revalidatePath('/admin/tools/system');
  return { message: 'New address made. Anyone using the old one will need the new one.' };
}

export async function createKeyAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await requireAdmin('super');
  const r = await createApiKey(db, actorOf(a), String(fd.get('name') ?? ''), fd.getAll('scopes').map(String));
  if (!r.ok) return { ok: false, errors: r.errors };
  revalidatePath('/admin/tools/api');
  return { ok: true, message: `Copy this key now. It won’t be shown again: ${r.key}` };
}

export async function revokeKeyAction(id: number) {
  const a = await requireAdmin('super');
  await revokeApiKey(db, actorOf(a), id);
  revalidatePath('/admin/tools/api');
}
