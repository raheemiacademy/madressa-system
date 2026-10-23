'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { saveTab } from '@/server/settings';
import { storeUpload } from '@/server/storage';
import { formToValues, tabByKey } from '@/settings/tabs';

export type TabFormState = { ok?: boolean; message?: string; errors?: Record<string, string> } | undefined;

export async function saveTabAction(key: string, _prev: TabFormState, fd: FormData): Promise<TabFormState> {
  const admin = await requireAdmin('super');
  const tab = tabByKey(key);
  if (!tab) return { message: 'Unknown settings section.' };

  const secrets: Record<string, string> = {};
  const files: Record<string, string | null | undefined> = {};
  for (const f of tab.fields) {
    if (f.type === 'secret') secrets[f.name] = String(fd.get(f.name) ?? '').slice(0, 500);
    if (f.type === 'file') {
      const up = fd.get(f.name);
      if (up instanceof File && up.size > 0) {
        const r = await storeUpload(db, up, f.kind, 'portal-background', admin.identityId);
        if (!r.ok) return { errors: { [f.name]: r.error }, message: 'Check the highlighted fields.' };
        files[f.name] = r.file.id;
      } else if (fd.get(`${f.name}.remove`) === 'on') files[f.name] = null;
    }
  }
  const res = await saveTab(db, { identityId: admin.identityId, name: admin.name }, tab, formToValues(tab, fd), secrets, files);
  if (!res.ok) return { errors: res.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin', 'layout');
  return { ok: true, message: `${tab.title} saved.` };
}
