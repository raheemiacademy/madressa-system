import { lookup } from 'node:dns/promises';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { ownerAction } from '@/db/schema';
import { audit } from '../audit';
import { needsFirstAdmin } from '../onboarding';
import { confirmOwnerCode } from './auth';
import type { Health } from './checks';

/*
 * The owner dashboard's madrasah management: add one, pause or resume it, remove it. Like restart and back up, each is only a
 * request in owner_action; the server's owner-actions script runs `./madrasah add | suspend | resume | remove` within a minute.
 * The website never gets Docker access. Removing asks for the madrasah's name and a fresh authenticator code, and the server
 * keeps a final backup and its keys in /srv/madrasah/removed before deleting anything.
 */
export const CHANGES = ['add', 'suspend', 'resume', 'remove'] as const;
export type Change = (typeof CHANGES)[number];
type Actor = { identityId: number; name: string };
type Resolver = (host: string) => Promise<string[]>;
/** The system's lookup (as the server itself would connect), giving up after 5 seconds. */
const lookup4: Resolver = (host) => Promise.race([
  lookup(host, { all: true, family: 4 }).then((r) => r.map((a) => a.address)),
  new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 5000))
]);

export const NAME_RE = /^[a-z0-9][a-z0-9-]{1,29}$/; // the same rule as ./madrasah add
const ADDRESS_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const WAIT_MS = 60 * 60_000; // the script gives up on a request it hasn't picked up within an hour
const WORDS: Record<Exclude<Change, 'add'>, string> = { suspend: 'pause', resume: 'resume', remove: 'remove' };

export const mainHost = () => { try { return new URL(process.env.APP_URL ?? '').hostname; } catch { return ''; } };
export const suggestedAddress = (name: string) => `${name || 'name'}.${mainHost()}`;
const hostOf = (url: string | null | undefined) => { try { return new URL(url ?? '').hostname; } catch { return ''; } };
const known = (health: Health | null, name: string) => health?.madrasahs?.find((m) => m.name === name) ?? null;

/** A request for this madrasah the server hasn't finished yet. */
const waiting = async (db: DbOrTx, name: string, now: Date) => (await db.select({ id: ownerAction.id, action: ownerAction.action }).from(ownerAction)
  .where(and(eq(ownerAction.madrasah, name), inArray(ownerAction.action, [...CHANGES]), isNull(ownerAction.finishedAt), gt(ownerAction.requestedAt, new Date(now.getTime() - WAIT_MS))))
  .limit(1))[0] ?? null;

export type AddErrors = Partial<Record<'name' | 'address', string>>;

/** Add a madrasah: a real one (its first admin signs up with the setup code) or a demo filled with sample data. */
export async function requestAdd(db: Db, actor: Actor, health: Health | null, raw: { name?: unknown; address?: unknown; demo?: unknown },
  now = new Date(), resolver: Resolver = lookup4): Promise<{ ok: true } | { ok: false; error?: string; errors?: AddErrors }> {
  const name = String(raw.name ?? '').trim().toLowerCase();
  const address = String(raw.address ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '') || suggestedAddress(name);
  const demo = raw.demo === true;
  if (!health) return { ok: false, error: 'Can’t read the server’s health file, so can’t see what’s already there. Try again in a few minutes.' };
  const errors: AddErrors = {};
  if (!NAME_RE.test(name)) errors.name = 'Use 2 to 30 lowercase letters, digits or dashes, starting with a letter or digit.';
  else if (name === 'main' || known(health, name)) errors.name = 'There’s already a madrasah called that.';
  else if (await waiting(db, name, now)) errors.name = 'That madrasah is already being added.';
  if (address.length > 200 || !ADDRESS_RE.test(address)) errors.address = 'Enter a web address like flc.example.co.uk.';
  else if (address === mainHost() || health.madrasahs?.some((m) => hostOf(m.url) === address)) errors.address = 'Another site already uses that address.';
  if (Object.keys(errors).length) return { ok: false, errors };

  // Caddy can only get its HTTPS certificate once the address points here, so check first rather than fail on the server.
  const [theirs, ours] = await Promise.all([resolver(address).catch((): string[] => []), resolver(mainHost()).catch((): string[] => [])]);
  if (!theirs.some((ip) => ours.includes(ip))) {
    return { ok: false, errors: { address: `${address} doesn’t point at this server yet. Add an A record for it pointing to ${ours[0] ?? 'the server'}, wait a few minutes, then try again.` } };
  }
  const [row] = await db.insert(ownerAction).values({ madrasah: name, action: 'add', address, demo, requestedAt: now }).returning({ id: ownerAction.id });
  await audit(db, actor, { action: `Asked the server to add ${name} at ${address}${demo ? ' (demo with sample data)' : ''}`, page: 'Owner', entity: 'owner_action', entityId: row!.id });
  return { ok: true };
}

/** Pause, resume or remove. Removing needs the madrasah's name typed and a fresh authenticator code. */
export async function requestChange(db: Db, actor: Actor, health: Health | null, name: string, action: unknown,
  confirm: { typed?: unknown; code?: unknown } = {}, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (action !== 'suspend' && action !== 'resume' && action !== 'remove') return { ok: false, error: 'Unknown action.' };
  const m = known(health, name);
  if (!m) return { ok: false, error: 'That madrasah isn’t on the server.' };
  if (action === 'suspend' && m.paused) return { ok: false, error: `${name} is already paused.` };
  if (action === 'resume' && !m.paused) return { ok: false, error: `${name} isn’t paused.` };
  if (await waiting(db, name, now)) return { ok: false, error: `Something for ${name} is already waiting for the server. Try again when it’s done.` };
  if (action === 'remove') {
    if (confirm.typed !== name) return { ok: false, error: `Type ${name} exactly to confirm.` };
    const c = await confirmOwnerCode(db, actor.identityId, String(confirm.code ?? '').replace(/\s/g, ''), now);
    if (!c.ok) return c;
  }
  const [row] = await db.insert(ownerAction).values({ madrasah: name, action, requestedAt: now }).returning({ id: ownerAction.id });
  await audit(db, actor, { action: `Asked the server to ${WORDS[action]} ${name}`, page: 'Owner', entity: 'owner_action', entityId: row!.id });
  return { ok: true };
}

/** Adds, pauses, resumes and removals asked for in the last day, newest first. */
export const recentChanges = (db: DbOrTx, now = new Date()) => db.select().from(ownerAction)
  .where(and(inArray(ownerAction.action, [...CHANGES]), gt(ownerAction.requestedAt, new Date(now.getTime() - 86_400_000))))
  .orderBy(desc(ownerAction.requestedAt), desc(ownerAction.id)).limit(20);

/** On a madrasah's copy: its setup code, only while nobody has used it to make the first admin. */
export async function setupCodeAnswer(db: DbOrTx): Promise<{ code: string } | { code: null; reason: 'set up' | 'none' }> {
  const code = process.env.SETUP_CODE ?? '';
  if (code.length < 8) return { code: null, reason: 'none' };
  return (await needsFirstAdmin(db)) ? { code } : { code: null, reason: 'set up' };
}

/** On the main site: asks a madrasah's copy for its setup code (the same private network and token as the summary). */
export async function fetchSetupCode(db: Db, actor: Actor, health: Health | null, name: string, fetcher: typeof fetch = fetch): Promise<{ ok: true; code: string; url: string } | { ok: false; error: string }> {
  const m = known(health, name);
  if (!m) return { ok: false, error: 'That madrasah isn’t on the server.' };
  let r: Response;
  try {
    r = await fetcher(`${m.internal}/api/owner/setup-code`, { headers: { authorization: `Bearer ${process.env.OWNER_SUMMARY_TOKEN ?? ''}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  } catch { return { ok: false, error: `${name} didn’t answer. If it was only just added, try again in a minute.` }; }
  const body = await r.json().catch(() => ({})) as { code?: unknown; reason?: unknown };
  if (!r.ok) return { ok: false, error: `${name} couldn’t answer (${r.status}).` };
  if (typeof body.code !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(body.code)) {
    return { ok: false, error: body.reason === 'set up' ? `${name} is already set up: its first admin has signed up.` : `${name} has no setup code. A demo copy has its sample admins instead.` };
  }
  await audit(db, actor, { action: `Looked at the setup code for ${name}`, page: 'Owner', entity: 'madrasah', entityId: name });
  return { ok: true, code: body.code, url: `${m.url ?? `https://${name}`}/admin/setup` };
}
