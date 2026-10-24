'use server';

import { cookies } from 'next/headers';
import { db } from '@/db';
import { KIOSK_COOKIE, kioskSignIn } from '@/server/attendance/teacher-logs';

export type KioskState = { ok: boolean; message: string } | undefined;

export async function kioskAction(_p: KioskState, fd: FormData): Promise<KioskState> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  const r = await kioskSignIn(db, token, Number(fd.get('teacherId')), String(fd.get('pin') ?? '').slice(0, 8));
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, message: `${r.name}: signed ${r.did} at ${r.time}.` };
}
