'use server';

import { db } from '@/db';
import { requestMeta } from '@/server/next/actor';
import { submitApplication } from '@/server/people/registration';

export type ApplyState = { ok?: boolean; count?: number; message?: string; errors?: Record<string, string> } | undefined;

export async function applyAction(kind: 'child' | 'adult', _p: ApplyState, fd: FormData): Promise<ApplyState> {
  const r = await submitApplication(db, kind === 'adult' ? 'adult' : 'child', fd, await requestMeta());
  if (!r.ok) return { errors: r.errors, message: r.errors.form ?? 'Please check the highlighted answers.' };
  return { ok: true, count: r.count };
}
