'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { formObject, type FormState } from '@/lib/validate';
import { requireAdmin } from '@/server/next/actor';
import { saveProfile } from '@/server/profile';
import { storeUpload } from '@/server/storage';
import { takeUploads } from '@/server/uploads';

export async function saveProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin('super');
  let logo: string | null | undefined;
  await takeUploads(fd); // the file came up first, with progress (FileDrop)
  const up = fd.get('logo');
  if (up instanceof File && up.size > 0) {
    const r = await storeUpload(db, up, 'image', 'logo', admin.identityId);
    if (!r.ok) return { errors: { logo: r.error }, message: 'Check the highlighted fields.' };
    logo = r.file.id;
  } else if (fd.get('logo.remove') === 'on') logo = null;
  const res = await saveProfile(db, { identityId: admin.identityId, name: admin.name }, formObject(fd), logo);
  if (!res.ok) return { errors: res.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'School profile saved.' };
}
