import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { DbOrTx } from '@/db';
import { setting } from '@/db/schema';
import { tabByKey, tabSchema, type Tab } from '@/settings/tabs';
import { audit, type AuditActor } from './audit';
import { encrypt } from './crypto';

export type TabValues = Record<string, unknown>;

export async function readTab(db: DbOrTx, key: string): Promise<TabValues> {
  const tab = tabByKey(key);
  if (!tab) throw new Error(`Unknown settings tab ${key}`);
  const [row] = await db.select().from(setting).where(eq(setting.tab, key)).limit(1);
  return tabSchema(tab).parse(row?.value ?? {}) as TabValues;
}

export type SaveResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Validates and stores one tab. `secrets` holds new plain-text values for secret fields (blank = keep);
 * `files` holds new file IDs (null = remove, undefined = keep).
 */
export async function saveTab(
  db: DbOrTx, actor: AuditActor, tab: Tab, values: TabValues,
  secrets: Record<string, string> = {}, files: Record<string, string | null | undefined> = {}
): Promise<SaveResult> {
  const current = await readTab(db, tab.key);
  const next: TabValues = { ...values };
  for (const f of tab.fields) {
    if (f.type === 'secret') next[f.name] = secrets[f.name]?.trim() ? { enc: encrypt(secrets[f.name]!.trim()) } : current[f.name];
    if (f.type === 'file') next[f.name] = files[f.name] === undefined ? current[f.name] : files[f.name];
  }
  const parsed = tabSchema(tab).safeParse(next);
  if (!parsed.success) return { ok: false, errors: flatten(tab, parsed.error) };

  const changed = tab.fields.map((f) => f.name).filter((n) => JSON.stringify(current[n]) !== JSON.stringify(parsed.data[n]));
  await db.insert(setting).values({ tab: tab.key, value: parsed.data, updatedBy: actor.identityId })
    .onConflictDoUpdate({ target: setting.tab, set: { value: parsed.data, updatedAt: new Date(), updatedBy: actor.identityId } });
  // Field names only — values can include personal or secret data.
  await audit(db, actor, { action: `Updated ${tab.title}`, page: 'Settings', entity: 'setting', entityId: tab.key, details: { changed } });
  return { ok: true };
}

function friendly(tab: Tab, name: string, fallback: string) {
  const f = tab.fields.find((x) => x.name === name);
  if (f?.type === 'int') return `Enter a whole number from ${f.min} to ${f.max}.`;
  if (f?.type === 'money') return 'Enter an amount such as 45 or 45.50.';
  if (f?.type === 'select' || f?.type === 'checks') return 'Choose from the options given.';
  if (f?.type === 'extensions') return 'Use letters and numbers only, separated by commas.';
  return fallback;
}

function flatten(tab: Tab, err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const name = String(i.path[0] ?? '');
    out[name] ??= friendly(tab, name, i.message);
  }
  return out;
}
