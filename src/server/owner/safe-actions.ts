import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { ownerAction, ownerMadrasahNote } from '@/db/schema';
import { audit } from '../audit';
import type { Health } from './checks';

/*
 * The owner dashboard's safe actions (OWNER-DASHBOARD.md, "3. One madrasah"): restart, back up now, and a set-password link
 * for one of a madrasah's admins; plus the owner's notes about each madrasah. Restart and back up are only requests: the
 * server's owner-actions script picks them up within a minute. Each is in the main site's audit log.
 */
export const ACTIONS = ['restart', 'backup'] as const;
export type SafeAction = (typeof ACTIONS)[number];
type Actor = { identityId: number; name: string };
const known = (health: Health | null, name: string) => health?.madrasahs?.find((m) => m.name === name) ?? null;
const WORDS: Record<SafeAction, string> = { restart: 'restart', backup: 'back up' };

/** Queues a restart or backup. A second request while one is still waiting isn't queued again. */
export async function requestAction(db: Db, actor: Actor, health: Health | null, name: string, action: unknown, now = new Date()): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  if (!ACTIONS.includes(action as SafeAction)) return { ok: false, error: 'Unknown action.' };
  if (!known(health, name)) return { ok: false, error: 'That madrasah isn’t on the server.' };
  // A request the script hasn't finished, made in the last 10 minutes, still stands.
  const [waiting] = await db.select({ id: ownerAction.id }).from(ownerAction)
    .where(and(eq(ownerAction.madrasah, name), eq(ownerAction.action, action as SafeAction), isNull(ownerAction.finishedAt), gt(ownerAction.requestedAt, new Date(now.getTime() - 10 * 60_000))));
  if (waiting) return { ok: true, already: true };
  const [row] = await db.insert(ownerAction).values({ madrasah: name, action: action as SafeAction, requestedAt: now }).returning({ id: ownerAction.id });
  await audit(db, actor, { action: `Asked the server to ${WORDS[action as SafeAction]} ${name}`, page: 'Owner', entity: 'owner_action', entityId: row!.id });
  return { ok: true, already: false };
}

/** Each action's newest request for a madrasah, to show whether it's waiting, done or failed. */
export async function latestActions(db: DbOrTx, name: string) {
  const rows = await db.select().from(ownerAction).where(eq(ownerAction.madrasah, name)).orderBy(desc(ownerAction.requestedAt), desc(ownerAction.id)).limit(20);
  return Object.fromEntries(ACTIONS.map((a) => [a, rows.find((r) => r.action === a) ?? null])) as Record<SafeAction, typeof rows[number] | null>;
}

/** Asks the madrasah's own copy for an admin's set-password link (the copy records it in its audit log too). */
export async function adminLink(db: Db, actor: Actor, health: Health | null, name: string, email: unknown, fetcher: typeof fetch = fetch): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const m = known(health, name);
  if (!m) return { ok: false, error: 'That madrasah isn’t on the server.' };
  if (typeof email !== 'string' || !email.includes('@') || email.length > 200) return { ok: false, error: 'Choose an admin.' };
  let r: Response;
  try {
    r = await fetcher(`${m.internal}/api/owner/set-password-link`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.OWNER_SUMMARY_TOKEN ?? ''}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email }), signal: AbortSignal.timeout(10_000), cache: 'no-store'
    });
  } catch { return { ok: false, error: `${name} didn’t answer. Try again in a minute.` }; }
  const body = await r.json().catch(() => ({})) as { link?: unknown; error?: unknown };
  if (!r.ok || typeof body.link !== 'string' || !/^https?:\/\/[^\s]+\/admin\/set-password\/[A-Za-z0-9_-]+$/.test(body.link)) {
    return { ok: false, error: typeof body.error === 'string' ? body.error.slice(0, 200) : `${name} couldn’t make a link (${r.status}).` };
  }
  await audit(db, actor, { action: `Made a set-password link for ${email} at ${name}`, page: 'Owner', entity: 'madrasah', entityId: name });
  return { ok: true, link: body.link };
}

export const NOTE_MAX = 5000;
export const madrasahNote = async (db: DbOrTx, name: string) =>
  (await db.select({ notes: ownerMadrasahNote.notes }).from(ownerMadrasahNote).where(eq(ownerMadrasahNote.madrasah, name)))[0]?.notes ?? '';

export async function saveMadrasahNote(db: Db, actor: Actor, health: Health | null, name: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof raw !== 'string') return { ok: false, error: 'Notes must be text.' };
  if (raw.length > NOTE_MAX) return { ok: false, error: `Keep notes under ${NOTE_MAX} characters.` };
  if (!known(health, name)) return { ok: false, error: 'That madrasah isn’t on the server.' };
  const notes = raw.trim();
  if (notes) await db.insert(ownerMadrasahNote).values({ madrasah: name, notes }).onConflictDoUpdate({ target: ownerMadrasahNote.madrasah, set: { notes, updatedAt: new Date() } });
  else await db.delete(ownerMadrasahNote).where(eq(ownerMadrasahNote.madrasah, name));
  await audit(db, actor, { action: `Changed the notes about ${name}`, page: 'Owner', entity: 'madrasah', entityId: name });
  return { ok: true };
}
