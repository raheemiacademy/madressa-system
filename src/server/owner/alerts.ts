import { and, count, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { loginIdentity, ownerAlert, pushQueue, setting } from '@/db/schema';
import { audit } from '../audit';
import { enqueueMail } from '../comm/mail';
import { appUrl } from '../password-links';
import { checksDue, DISK_LIMIT, MEMORY_LIMIT, ownerState, type OwnerState, readHealth, runChecks } from './checks';

/*
 * The owner dashboard's alerts (OWNER-DASHBOARD.md, "Alerts"): phone push and email for a madrasah that stops responding or
 * comes back, a late or failed backup, a full disk or memory, and each new lead. One alert per problem until it clears.
 * Push goes to the owner's own devices through the portals' push queue. Email goes through the mail queue (log-only until a
 * real email service is connected). Settings are one row in `setting`.
 */
export const ALERT_KINDS = ['down', 'back', 'backup', 'server', 'signup', 'contact'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
const SETTINGS_TAB = 'owner_alerts';

const settingsSchema = z.object({
  on: z.object(Object.fromEntries(ALERT_KINDS.map((k) => [k, z.boolean()])) as Record<AlertKind, z.ZodBoolean>),
  email: z.string().trim().toLowerCase().max(200).pipe(z.union([z.literal(''), z.email()])).transform((v) => v || null).nullable()
});
export type AlertSettings = { on: Record<AlertKind, boolean>; email: string | null };
const DEFAULTS: AlertSettings = { on: Object.fromEntries(ALERT_KINDS.map((k) => [k, true])) as Record<AlertKind, boolean>, email: null };

export async function alertSettings(db: DbOrTx): Promise<AlertSettings> {
  const [row] = await db.select().from(setting).where(eq(setting.tab, SETTINGS_TAB));
  const p = settingsSchema.safeParse(row?.value);
  return p.success ? { on: { ...DEFAULTS.on, ...p.data.on }, email: p.data.email } : DEFAULTS;
}

export async function saveAlertSettings(db: Db, actor: { identityId: number; name: string }, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = settingsSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues.some((i) => i.path[0] === 'email') ? 'Enter an email address like name@example.org, or leave it empty.' : 'Those settings weren’t valid.' };
  const value = { on: p.data.on, email: p.data.email };
  await db.insert(setting).values({ tab: SETTINGS_TAB, value, updatedBy: actor.identityId }).onConflictDoUpdate({ target: setting.tab, set: { value, updatedAt: new Date(), updatedBy: actor.identityId } });
  await audit(db, actor, { action: 'Changed the owner alert settings', page: 'Owner', entity: 'setting', entityId: SETTINGS_TAB, details: { on: value.on, email: value.email ? 'set' : 'none' } });
  return { ok: true };
}

type NewAlert = { kind: AlertKind; key: string; about: string; title: string; url: string };

/** Push to every device the owner turned push on for. Returns whether there was one. */
async function pushToOwner(db: DbOrTx, a: NewAlert) {
  const ids = await db.select({ id: loginIdentity.id }).from(loginIdentity)
    .where(and(eq(loginIdentity.portal, 'owner'), sql`exists (select 1 from push_subscription s where s.identity_id = ${loginIdentity.id})`));
  if (ids.length) await db.insert(pushQueue).values(ids.map((r) => ({ identityId: r.id, title: a.about.slice(0, 120), body: a.title.slice(0, 240), url: a.url })));
  return ids.length > 0;
}

/**
 * Sends an alert unless one about the same thing is still open. `news` alerts (back up, new lead) are cleared as they're
 * sent. Returns whether it was sent.
 */
export async function raiseAlert(db: DbOrTx, a: NewAlert, opts: { news?: boolean; now?: Date; emailedTo?: string } = {}) {
  const now = opts.now ?? new Date();
  const s = await alertSettings(db);
  const [open] = await db.select({ id: ownerAlert.id }).from(ownerAlert).where(and(eq(ownerAlert.key, a.key), isNull(ownerAlert.clearedAt)));
  if (open) return false;
  const on = s.on[a.kind];
  const pushed = on && (await pushToOwner(db, a));
  // `emailedTo`: an address that already has this news (a new lead's own notice), so it isn't sent twice.
  const already = !!s.email && s.email === opts.emailedTo?.trim().toLowerCase();
  const emailed = on && !!s.email && (already || (await enqueueMail(db, [{
    to: s.email!, subject: `Madressa Owner: ${a.about} — ${a.title}`, entity: 'owner_alert',
    html: `<p><b>${esc(a.about)}</b>: ${esc(a.title)}</p><p><a href="${appUrl()}${a.url}">Open the owner dashboard</a></p>`
  }])) > 0);
  const channels = pushed && emailed ? 'Push and email' : pushed ? 'Push' : emailed ? 'Email' : 'Not sent';
  // The unique index on open alerts means two workers can't both send one; whoever loses just doesn't record it.
  const [row] = await db.insert(ownerAlert).values({ kind: a.kind, key: a.key, about: a.about, title: a.title, sentAt: now, clearedAt: opts.news ? now : null, channels })
    .onConflictDoNothing().returning({ id: ownerAlert.id });
  return !!row;
}

/** Marks an open problem as over. Returns when it began, or null if nothing was open. */
export async function clearAlert(db: DbOrTx, key: string, now = new Date()) {
  const [row] = await db.update(ownerAlert).set({ clearedAt: now }).where(and(eq(ownerAlert.key, key), isNull(ownerAlert.clearedAt))).returning({ sentAt: ownerAlert.sentAt });
  return row?.sentAt ?? null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** After each round of checks: raise or clear each problem the dashboard can see. */
export async function evaluateAlerts(db: DbOrTx, s: OwnerState) {
  const now = s.now;
  for (const m of s.madrasahs) {
    const url = `/owner/madrasahs/${encodeURIComponent(m.name)}`;
    if (m.status === 'paused') await clearAlert(db, `down:${m.name}`, now); // paused on purpose, so no "responding again" news
    else if (m.status === 'down') await raiseAlert(db, { kind: 'down', key: `down:${m.name}`, about: m.name, title: `Not responding (${plural(m.failedChecks, 'check', 'checks')})`, url }, { now });
    else if (m.status === 'up') {
      const since = await clearAlert(db, `down:${m.name}`, now);
      if (since) await raiseAlert(db, { kind: 'back', key: `back:${m.name}:${now.getTime()}`, about: m.name, title: `Responding again after ${plural(minutes(now.getTime() - since.getTime()), 'minute', 'minutes')}`, url }, { news: true, now });
    }
    const late = !m.backup ? 'No backup yet' : now.getTime() - m.backup.at.getTime() > 26 * 3_600_000 ? 'Backup over 26 hours old' : !m.backup.lastNightRan ? 'Last night’s backup didn’t run' : null;
    if (late) await raiseAlert(db, { kind: 'backup', key: `backup:${m.name}`, about: m.name, title: late, url: '/owner/server' }, { now });
    else await clearAlert(db, `backup:${m.name}`, now);
  }
  // A madrasah that has been removed: its problems go with it.
  if (s.health) await db.update(ownerAlert).set({ clearedAt: now })
    .where(and(isNull(ownerAlert.clearedAt), inArray(ownerAlert.kind, ['down', 'backup']), notInArray(ownerAlert.about, s.madrasahs.map((m) => m.name))));
  for (const [key, pct, limit, what] of [['disk', s.disk, DISK_LIMIT, 'disk'], ['memory', s.memory, MEMORY_LIMIT, 'memory']] as const) {
    if (pct === null) continue;
    if (pct >= limit) await raiseAlert(db, { kind: 'server', key, about: 'Server', title: `Server ${what} over ${limit}% (${pct}%)`, url: '/owner/server' }, { now });
    else await clearAlert(db, key, now);
  }
}

/** A new early-access sign-up or contact message (called as it arrives, on the main site). */
export const alertNewLead = (db: DbOrTx, l: { id: number; kind: 'early_access' | 'contact'; who: string }) => raiseAlert(db, {
  kind: l.kind === 'contact' ? 'contact' : 'signup', key: `lead:${l.id}`, about: l.who,
  title: l.kind === 'contact' ? 'New contact message' : 'New early-access sign-up', url: `/owner/leads/${l.id}`
}, { news: true, emailedTo: process.env.EARLY_ACCESS_NOTIFY_EMAIL });

export async function alertHistory(db: DbOrTx, limit = 50) {
  const [rows, [total]] = await Promise.all([
    db.select().from(ownerAlert).orderBy(desc(ownerAlert.sentAt), desc(ownerAlert.id)).limit(limit),
    db.select({ n: count() }).from(ownerAlert)
  ]);
  return { rows, total: total!.n };
}

/** The worker's step, on the main site only: a round of checks every 5 minutes, then the alerts it calls for. */
export async function ownerTick(db: Db, now = new Date()) {
  if (process.env.MARKETING_SITE !== '1' || !(await checksDue(db, now))) return;
  const health = await readHealth();
  await runChecks(db, health, now);
  await evaluateAlerts(db, await ownerState(db, health, now));
}
