'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/server/next/actor';

export async function chooseYear(id: number) {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return;
  (await cookies()).set('year_id', String(id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/admin', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/admin', 'layout');
}

