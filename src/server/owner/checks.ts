import { readFile } from 'node:fs/promises';
import { and, desc, eq, gt, lt, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { ownerCheck } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { LATEST } from '@/lib/releases';

/*
 * The owner dashboard's health checks (OWNER-DASHBOARD.md, "How it works"). The server script writes owner/health.json every
 * 5 minutes (disk, memory, CPU, containers, backups, and which madrasahs exist); the main site's worker reads it and asks each
 * madrasah's copy for its summary over the private network, keeping each answer in owner_check for 7 days.
 */
export const CHECK_EVERY_MS = 5 * 60_000;
const KEEP_MS = 7 * 24 * 3_600_000;
export const STALE_HEALTH_MS = 15 * 60_000;
export const BACKUP_LATE_HOURS = 26;
export const QUIET_DAYS = 14;
export const DISK_LIMIT = 85;
export const MEMORY_LIMIT = 90;

const bytes = z.object({ usedBytes: z.number(), totalBytes: z.number().positive() });
const healthSchema = z.object({
  generatedAt: z.string(),
  cpuPercent: z.number().optional(),
  memory: bytes.optional(),
  disk: bytes.optional(),
  containers: z.array(z.object({ name: z.string(), state: z.string(), exitCode: z.number(), startedAt: z.string(), memoryBytes: z.number().nullable() })).optional(),
  madrasahs: z.array(z.object({
    name: z.string().regex(/^[a-z0-9-]+$/), url: z.string().nullable().optional(), internal: z.string(),
    backup: z.object({ at: z.string(), sizeBytes: z.number(), databaseBytes: z.number() }).nullable()
  })).optional(),
  imageCreatedAt: z.string().optional(),
  history: z.array(z.tuple([z.number(), z.number().nullable(), z.number().nullable(), z.number().nullable()])).default([]),
  errors: z.array(z.string()).default([])
});
export type Health = z.infer<typeof healthSchema>;

/** What the main site keeps from a madrasah's answer: these fields only, whatever else might be sent. */
const summarySchema = z.object({
  version: z.string().max(20),
  counts: z.object({ students: z.number().int(), teachers: z.number().int(), staff: z.number().int(), parents: z.number().int(), parentsWithLogin: z.number().int() }),
  lastActiveAt: z.string().nullable()
});
export type StoredSummary = z.infer<typeof summarySchema>;

const healthFile = () => process.env.OWNER_HEALTH_FILE || '/owner/health.json';

export async function readHealth(): Promise<Health | null> {
  try { return healthSchema.parse(JSON.parse(await readFile(healthFile(), 'utf8'))); } catch { return null; }
}

/** One round: ask every madrasah the health file lists, and keep the answers. */
export async function runChecks(db: Db, health: Health | null, now = new Date(), fetcher: typeof fetch = fetch) {
  const token = process.env.OWNER_SUMMARY_TOKEN ?? '';
  const list = health?.madrasahs ?? [];
  const rows = await Promise.all(list.map(async (m) => {
    try {
      const r = await fetcher(`${m.internal}/api/owner/summary`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!r.ok) return { madrasah: m.name, at: now, ok: false, error: `Answered ${r.status}` };
      return { madrasah: m.name, at: now, ok: true, summary: summarySchema.parse(await r.json()) };
    } catch (e) {
      const err = e as Error;
      return { madrasah: m.name, at: now, ok: false, error: err.name === 'TimeoutError' ? 'No answer within 10 seconds' : err.name === 'ZodError' ? 'Answered with something unexpected' : 'Couldn’t be reached' };
    }
  }));
  if (rows.length) await db.insert(ownerCheck).values(rows);
  await db.delete(ownerCheck).where(lt(ownerCheck.at, new Date(now.getTime() - KEEP_MS)));
  return rows.length;
}

/** The worker's step: a round every 5 minutes (a little early is fine, so the 15-second ticks don't push it to 5¼). */
export async function checksDue(db: DbOrTx, now = new Date()) {
  const [r] = await db.select({ last: max(ownerCheck.at) }).from(ownerCheck);
  return !r?.last || now.getTime() - r.last.getTime() >= CHECK_EVERY_MS - 20_000;
}

export type MadrasahState = {
  name: string; url: string | null; host: string;
  status: 'up' | 'down' | 'missed' | 'waiting';
  summary: StoredSummary | null; lastOkAt: Date | null; downSince: Date | null; failedChecks: number;
  backup: { at: Date; sizeBytes: number; lastNightRan: boolean } | null;
  memoryBytes: number | null; startedAt: Date | null;
  attention: { text: string; since: Date } | null;
};

/** When the nightly backup (02:00 UTC, the server's cron) should most recently have run. */
export function lastBackupRun(now: Date) {
  const run = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2));
  return run > now ? new Date(run.getTime() - 86_400_000) : run;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));
const hostOf = (url: string | null | undefined, name: string) => { try { return new URL(url ?? '').host; } catch { return name; } };

/** One madrasah's standing, from its latest checks and the health file. The most urgent problem is its "attention" line. */
export async function madrasahState(db: DbOrTx, m: NonNullable<Health['madrasahs']>[number], health: Health, now: Date): Promise<MadrasahState> {
  const recent = await db.select().from(ownerCheck).where(eq(ownerCheck.madrasah, m.name)).orderBy(desc(ownerCheck.at)).limit(2);
  const [lastOk] = await db.select().from(ownerCheck).where(and(eq(ownerCheck.madrasah, m.name), eq(ownerCheck.ok, true))).orderBy(desc(ownerCheck.at)).limit(1);
  const failing = await db.select({ n: sql<number>`count(*)::int`, since: sql<Date | null>`min(${ownerCheck.at})` }).from(ownerCheck)
    .where(and(eq(ownerCheck.madrasah, m.name), eq(ownerCheck.ok, false), ...(lastOk ? [gt(ownerCheck.at, lastOk.at)] : [])));
  const failedChecks = failing[0]?.n ?? 0;
  const downSince = failedChecks ? new Date(failing[0]!.since!) : null;
  const status = !recent.length ? 'waiting' : recent[0]!.ok ? 'up' : recent.length === 2 && !recent[1]!.ok ? 'down' : 'missed';
  const summary = lastOk ? summarySchema.parse(lastOk.summary) : null;
  const container = health.containers?.find((c) => c.name === `ma-${m.name}`);
  const backupAt = m.backup ? new Date(m.backup.at) : null;
  const backup = m.backup && backupAt ? { at: backupAt, sizeBytes: m.backup.sizeBytes, lastNightRan: backupAt.getTime() >= lastBackupRun(now).getTime() - 10 * 60_000 } : null;
  const lastActive = summary?.lastActiveAt ? new Date(summary.lastActiveAt) : null;

  let attention: MadrasahState['attention'] = null;
  if (status === 'down') attention = { text: `Not responding for ${plural(minutes(now.getTime() - downSince!.getTime()), 'minute', 'minutes')} (${plural(failedChecks, 'check', 'checks')})`, since: downSince! };
  else if (status === 'missed') attention = { text: 'Didn’t answer the last check', since: recent[0]!.at };
  else if (!backup) attention = { text: 'No backup yet', since: lastBackupRun(now) };
  else if (now.getTime() - backup.at.getTime() > BACKUP_LATE_HOURS * 3_600_000) attention = { text: `Newest backup is ${Math.floor((now.getTime() - backup.at.getTime()) / 3_600_000)} hours old`, since: new Date(backup.at.getTime() + BACKUP_LATE_HOURS * 3_600_000) };
  else if (summary && summary.version !== LATEST.version) attention = { text: `Running an older version (${summary.version})`, since: lastOk!.at };
  else if (summary && !lastActive) attention = { text: 'Never used', since: lastOk!.at };
  else if (lastActive && now.getTime() - lastActive.getTime() >= QUIET_DAYS * 86_400_000) attention = { text: `Not used for ${Math.floor((now.getTime() - lastActive.getTime()) / 86_400_000)} days`, since: new Date(lastActive.getTime() + QUIET_DAYS * 86_400_000) };

  return {
    name: m.name, url: m.url ?? null, host: hostOf(m.url, m.name), status, summary, lastOkAt: lastOk?.at ?? null, downSince, failedChecks, backup,
    memoryBytes: container?.memoryBytes ?? null, startedAt: container?.state === 'running' ? new Date(container.startedAt) : null, attention
  };
}

export type OwnerState = Awaited<ReturnType<typeof ownerState>>;

/** Everything the Overview, Madrasahs and Server pages show. */
export async function ownerState(db: DbOrTx, health: Health | null, now = new Date()) {
  const [last] = await db.select({ at: max(ownerCheck.at) }).from(ownerCheck);
  const healthAge = health ? now.getTime() - new Date(health.generatedAt).getTime() : null;
  const madrasahs = health ? await Promise.all((health.madrasahs ?? []).map((m) => madrasahState(db, m, health, now))) : [];
  const pct = (b?: { usedBytes: number; totalBytes: number }) => b ? Math.round((100 * b.usedBytes) / b.totalBytes) : null;
  const disk = pct(health?.disk), memory = pct(health?.memory);
  const problem = !health ? 'Can’t read the server’s health file' : healthAge! > STALE_HEALTH_MS ? `Server health is ${minutes(healthAge!)} minutes old` : !process.env.OWNER_SUMMARY_TOKEN ? 'OWNER_SUMMARY_TOKEN isn’t set on the main site' : null;
  type Need = { kind: 'bad' | 'warn'; text: string; name?: string; href: string; at: Date };
  const needs: Need[] = [
    ...madrasahs.filter((m) => m.attention).map((m): Need => ({ kind: m.status === 'down' ? 'bad' : 'warn', name: m.name, text: m.attention!.text, href: '/owner/madrasahs', at: m.attention!.since })),
    ...(disk !== null && disk >= DISK_LIMIT ? [{ kind: 'bad' as const, text: `Server disk is ${disk}% full`, href: '/owner/server', at: new Date(health!.generatedAt) }] : []),
    ...(memory !== null && memory >= MEMORY_LIMIT ? [{ kind: 'bad' as const, text: `Server memory is ${memory}% used`, href: '/owner/server', at: new Date(health!.generatedAt) }] : []),
    ...(problem ? [{ kind: 'warn' as const, text: problem, href: '/owner/server', at: health ? new Date(health.generatedAt) : now }] : [])
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    now, health, healthProblem: problem, lastCheckAt: last?.at ?? null, madrasahs, needs, disk, memory, cpu: health?.cpuPercent ?? null,
    attentionCount: madrasahs.filter((m) => m.attention).length // a madrasah that is down is also flagged, but counts once
  };
}

/** The worker's step, on the main site only. */
export async function ownerTick(db: Db, now = new Date()) {
  if (process.env.MARKETING_SITE !== '1' || !(await checksDue(db, now))) return;
  await runChecks(db, await readHealth(), now);
}

const HALF_DAY = 12 * 3_600_000;

/** The last 7 days as 14 half-day points (the average of each half-day's readings); half-days with no readings are left out. */
export function weekSeries(history: Health['history'], col: 1 | 2 | 3, now: Date) {
  const vals: number[] = [], labels: string[] = [];
  for (let i = 0; i < 14; i++) {
    const from = now.getTime() - (14 - i) * HALF_DAY, to = from + HALF_DAY;
    const xs = history.filter((h) => h[0] * 1000 >= from && h[0] * 1000 < to && h[col] !== null).map((h) => h[col]!);
    if (!xs.length) continue;
    vals.push(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length));
    labels.push(i === 13 ? 'Now' : formatInstant(new Date(from), 'EEE HH:mm'));
  }
  return { vals, labels };
}
