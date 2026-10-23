import { saveTab } from '@/server/settings';
import { formToValues, tabByKey } from '@/settings/tabs';
import { db } from './helpers';

/** Saves a settings tab from form-style values (ticked boxes = 'on'). */
export async function setSetting(actor: { identityId: number; name: string }, key: string, values: Record<string, string>) {
  const tab = tabByKey(key)!;
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  const r = await saveTab(db, actor, tab, formToValues(tab, fd));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
}
