import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ownerCheck } from '@/db/schema';
import { ago, duration, size, sizeOf, whenShort } from '@/lib/owner-format';
import { LATEST } from '@/lib/releases';
import { checksDue, type Health, type StoredSummary, lastBackupRun, ownerState, runChecks, weeklyTotals, weekSeries } from '@/server/owner/checks';
import { ownerTick } from '@/server/owner/alerts';
import { db, resetDb } from './helpers';

const env = { OWNER_SUMMARY_TOKEN: process.env.OWNER_SUMMARY_TOKEN, MARKETING_SITE: process.env.MARKETING_SITE, OWNER_HEALTH_FILE: process.env.OWNER_HEALTH_FILE };
beforeAll(() => { process.env.OWNER_SUMMARY_TOKEN = 't'.repeat(40); process.env.OWNER_HEALTH_FILE = 'does-not-exist.json'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const NOW = new Date('2026-10-27T14:00:00Z');
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);
const LONG = 'jamia-masjid-ghausia-bolton-weekend-hifz-and-evening-maktab-girls-section';
const health = (over: Partial<Health> = {}): Health => ({
  generatedAt: min(2).toISOString(), cpuPercent: 12, memory: { usedBytes: 2e9, totalBytes: 4e9 }, disk: { usedBytes: 10e9, totalBytes: 40e9 },
  containers: [{ name: 'ma-demo', state: 'running', exitCode: 0, startedAt: '2026-10-27T12:00:00Z', memoryBytes: 480e6 }],
  madrasahs: [
    { name: 'demo', url: 'https://demo.example.org', internal: 'http://ma-demo:3000', backup: { at: '2026-10-27T02:00:02Z', sizeBytes: 339023, databaseBytes: 325600 } },
    { name: 'flc', url: 'https://flc.example.org', internal: 'http://ma-flc:3000', backup: { at: '2026-10-27T02:00:03Z', sizeBytes: 316526, databaseBytes: 314418 } }
  ],
  imageCreatedAt: '2026-10-27T12:00:51Z', history: [], errors: [], ...over
});
const summary = (over: Record<string, unknown> = {}) => ({ version: LATEST.version, counts: { students: 102, teachers: 6, staff: 2, parents: 80, parentsWithLogin: 41 }, lastActiveAt: min(5).toISOString(), ...over });
const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const by = (s: Awaited<ReturnType<typeof ownerState>>, name: string) => s.madrasahs.find((m) => m.name === name)!;

describe('a round of checks', () => {
  it('keeps each answer, with only the fields the owner may know, even if a copy sends more', async () => {
    const fetcher = (async (url: string) => {
      expect(url).toMatch(/^http:\/\/ma-(demo|flc):3000\/api\/owner\/summary$/);
      return new Response(JSON.stringify({ ...summary(), children: [{ name: 'A Child' }], counts: { ...summary().counts, extra: 1 } }));
    }) as unknown as typeof fetch;
    expect(await runChecks(db, health(), NOW, fetcher)).toBe(2);
    const rows = await db.select().from(ownerCheck);
    expect(rows.map((r) => r.ok)).toEqual([true, true]);
    expect(rows[0]!.summary).toEqual(summary());
    expect(JSON.stringify(rows)).not.toContain('A Child');
  });

  it('sends the token, and records a copy that answers with an error, junk or nothing', async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('authorization')!);
      if (url.includes('demo')) return new Response(null, { status: 403 });
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    await runChecks(db, health(), NOW, fetcher);
    expect(seen).toEqual([`Bearer ${'t'.repeat(40)}`, `Bearer ${'t'.repeat(40)}`]);
    const rows = await db.select().from(ownerCheck);
    expect(rows.map((r) => [r.madrasah, r.ok, r.error])).toEqual([['demo', false, 'Answered 403'], ['flc', false, 'No answer within 10 seconds']]);
    await resetDb();
    await runChecks(db, health(), NOW, answer({ version: 1 }));
    expect((await db.select().from(ownerCheck))[0]!.error).toBe('Answered with something unexpected');
  });

  it('keeps 7 days of checks', async () => {
    await db.insert(ownerCheck).values([{ madrasah: 'demo', ok: true, at: new Date(NOW.getTime() - 8 * 86_400_000) }, { madrasah: 'demo', ok: true, at: new Date(NOW.getTime() - 6 * 86_400_000) }]);
    await runChecks(db, health({ madrasahs: [] }), NOW);
    expect(await db.select().from(ownerCheck)).toHaveLength(1);
  });

  it('runs every 5 minutes, on the main site only', async () => {
    expect(await checksDue(db, NOW)).toBe(true);
    await db.insert(ownerCheck).values({ madrasah: 'demo', ok: true, at: min(3) });
    expect(await checksDue(db, NOW)).toBe(false);
    expect(await checksDue(db, new Date(NOW.getTime() + 2 * 60_000))).toBe(true);
    delete process.env.MARKETING_SITE;
    await ownerTick(db, new Date(NOW.getTime() + 60 * 60_000));
    expect(await db.select().from(ownerCheck)).toHaveLength(1); // a madrasah copy never checks anything
    process.env.MARKETING_SITE = '1';
    await ownerTick(db, new Date(NOW.getTime() + 60 * 60_000)); // no health file here, so a round with nothing to ask
    process.env.MARKETING_SITE = env.MARKETING_SITE ?? '';
  });
});

describe('step 3 numbers', () => {
  const full = (over: Record<string, unknown> = {}) => summary({
    usage: { byStatus: { current: 102, waiting: 8, onHold: 1, leftThisYear: 0 }, classes: 4, logins: { last7: 18, last30: 77 }, registersThisWeek: { taken: 15, planned: 16 }, thisMonth: { messages: 9, homework: 4, incidents: 0 }, errors24h: 0 },
    weeks: [{ start: '2026-10-19', students: 100, registers: 16, logins: 20, parentLogins: 12, messages: 7 }, { start: '2026-10-26', students: 102, registers: 15, logins: 18, parentLogins: 10, messages: 9 }],
    money: { month: { invoiced: 459000, collected: 312050, overdue: 45000, familiesOverdue: 6 }, year: { invoiced: 918000, collected: 765000, overdue: 45000, familiesOverdue: 6 } },
    admins: [{ name: 'Sample Admin', email: 'office@example.org', phone: '07700 900002', access: 'Super', password: 'never kept' }], ...over
  });

  it('keeps usage, weeks, money and admin contacts, and nothing extra inside them', async () => {
    await runChecks(db, health(), NOW, answer(full()));
    const [row] = await db.select().from(ownerCheck);
    const kept = row!.summary as StoredSummary;
    expect(kept.money).toEqual((full() as StoredSummary).money);
    expect(kept.admins).toEqual([{ name: 'Sample Admin', email: 'office@example.org', phone: '07700 900002', access: 'Super' }]);
    expect(JSON.stringify(kept)).not.toContain('never kept');
  });

  it('still reads a copy on the previous version (no step 3 numbers), and flags its version', async () => {
    await runChecks(db, health(), NOW, answer(summary({ version: '1.1' })));
    const s = await ownerState(db, health(), NOW);
    expect(by(s, 'demo')).toMatchObject({ status: 'up', attention: { text: 'Running an older version (1.1)' } });
    expect(by(s, 'demo').summary?.money).toBeUndefined();
  });

  it('adds up each week across madrasahs, and the registers planned this week', () => {
    const a = { summary: full() as never }, b = { summary: full({ weeks: [{ start: '2026-10-26', students: 10, registers: 5, logins: 1, parentLogins: 1, messages: 1 }] }) as never };
    expect(weeklyTotals([a, b, { summary: null }])).toEqual({
      starts: ['2026-10-19', '2026-10-26'], students: [100, 112], registers: [16, 20], parentLogins: [12, 11], messages: [7, 10], registersPlanned: 32
    });
    expect(weeklyTotals([])).toEqual({ starts: [], students: [], registers: [], parentLogins: [], messages: [], registersPlanned: 0 });
  });

  it('links each problem to that madrasah’s page', async () => {
    await db.insert(ownerCheck).values([{ madrasah: 'demo', ok: false, at: min(5) }, { madrasah: 'demo', ok: false, at: min(0) }]);
    expect((await ownerState(db, health(), NOW)).needs[0]!.href).toBe('/owner/madrasahs/demo');
  });
});

describe('what each madrasah shows', () => {
  const check = (madrasah: string, minutesAgo: number, ok: boolean, s: unknown = summary()) => ({ madrasah, at: min(minutesAgo), ok, summary: ok ? s : null, error: ok ? null : 'Couldn’t be reached' });

  it('waiting, then running with nothing to flag', async () => {
    let s = await ownerState(db, health(), NOW);
    expect(by(s, 'demo')).toMatchObject({ status: 'waiting', attention: null, host: 'demo.example.org' });
    expect(s.lastCheckAt).toBeNull();
    await db.insert(ownerCheck).values([check('demo', 6, true), check('demo', 1, true)]);
    s = await ownerState(db, health(), NOW);
    expect(by(s, 'demo')).toMatchObject({ status: 'up', attention: null, failedChecks: 0, memoryBytes: 480e6 });
    expect(by(s, 'demo').backup).toMatchObject({ lastNightRan: true, sizeBytes: 339023 });
  });

  it('one missed check is a warning; two in a row is down, counted in minutes and checks', async () => {
    await db.insert(ownerCheck).values([check('demo', 20, true), check('demo', 10, false)]);
    expect(by(await ownerState(db, health(), NOW), 'demo')).toMatchObject({ status: 'missed', attention: { text: 'Didn’t answer the last check' } });
    await db.insert(ownerCheck).values([check('demo', 5, false), check('demo', 0, false)]);
    const demo = by(await ownerState(db, health(), NOW), 'demo');
    expect(demo).toMatchObject({ status: 'down', failedChecks: 3, attention: { text: 'Not responding for 10 minutes (3 checks)' } });
    expect(demo.summary?.counts.students).toBe(102); // the last good answer is still shown
  });

  it('a copy that has never answered is down with no numbers', async () => {
    await db.insert(ownerCheck).values([check('flc', 5, false), check('flc', 0, false)]);
    const flc = by(await ownerState(db, health(), NOW), 'flc');
    expect(flc).toMatchObject({ status: 'down', summary: null, attention: { text: 'Not responding for 5 minutes (2 checks)' } });
  });

  it('flags a late or missing backup, an older version, and a madrasah nobody uses', async () => {
    const h = health({ madrasahs: [
      { name: 'late', url: null, internal: 'x', backup: { at: new Date(NOW.getTime() - 30 * 3_600_000).toISOString(), sizeBytes: 1, databaseBytes: 1 } },
      { name: 'none', url: 'https://none.example.org', internal: 'x', backup: null },
      { name: 'old', url: null, internal: 'x', backup: health().madrasahs![0]!.backup },
      { name: 'never', url: null, internal: 'x', backup: health().madrasahs![0]!.backup },
      { name: 'quiet', url: null, internal: 'x', backup: health().madrasahs![0]!.backup },
      { name: LONG, url: `https://${LONG}.example.org`, internal: 'x', backup: health().madrasahs![0]!.backup }
    ] });
    await db.insert(ownerCheck).values([check('late', 1, true), check('none', 1, true), check('old', 1, true, summary({ version: '0.9' })),
      check('never', 1, true, summary({ lastActiveAt: null })), check('quiet', 1, true, summary({ lastActiveAt: new Date(NOW.getTime() - 15 * 86_400_000).toISOString() })), check(LONG, 1, true)]);
    const s = await ownerState(db, h, NOW);
    expect(Object.fromEntries(s.madrasahs.map((m) => [m.name, m.attention?.text ?? null]))).toEqual({
      late: 'Newest backup is 30 hours old', none: 'No backup yet', old: 'Running an older version (0.9)', never: 'Never used', quiet: 'Not used for 15 days', [LONG]: null
    });
    expect(by(s, 'late').backup?.lastNightRan).toBe(false);
    expect(by(s, 'late').host).toBe('late'); // no address: shown by name
    expect(s.attentionCount).toBe(5);
  });

  it('counts a madrasah that is down and flagged once, and lists what needs you newest first', async () => {
    const h = health({ disk: { usedBytes: 38e9, totalBytes: 40e9 }, memory: { usedBytes: 3.8e9, totalBytes: 4e9 },
      madrasahs: [{ name: 'demo', url: null, internal: 'x', backup: null }, health().madrasahs![1]!] });
    await db.insert(ownerCheck).values([check('demo', 5, false), check('demo', 0, false), check('flc', 0, true, summary({ version: '0.9' }))]);
    const s = await ownerState(db, h, NOW);
    expect(s.attentionCount).toBe(2);
    expect(s.needs.map((n) => [n.kind, n.name ?? null, n.text])).toEqual([
      ['warn', 'flc', 'Running an older version (0.9)'], ['bad', null, 'Server disk is 95% full'], ['bad', null, 'Server memory is 95% used'], ['bad', 'demo', 'Not responding for 5 minutes (2 checks)']
    ]);
  });

  it('says when the server’s health file is missing or old, or the token isn’t set', async () => {
    expect((await ownerState(db, null, NOW)).healthProblem).toBe('Can’t read the server’s health file');
    expect((await ownerState(db, null, NOW)).madrasahs).toEqual([]);
    expect((await ownerState(db, health({ generatedAt: min(40).toISOString() }), NOW)).healthProblem).toBe('Server health is 40 minutes old');
    delete process.env.OWNER_SUMMARY_TOKEN;
    try { expect((await ownerState(db, health(), NOW)).healthProblem).toBe('OWNER_SUMMARY_TOKEN isn’t set on the main site'); } finally { process.env.OWNER_SUMMARY_TOKEN = 't'.repeat(40); }
    expect((await ownerState(db, health(), NOW)).healthProblem).toBeNull();
  });
});

describe('server and display helpers', () => {
  it('knows when last night’s backup should have run (02:00 UTC)', () => {
    expect(lastBackupRun(NOW).toISOString()).toBe('2026-10-27T02:00:00.000Z');
    expect(lastBackupRun(new Date('2026-10-27T01:59:00Z')).toISOString()).toBe('2026-10-26T02:00:00.000Z');
  });

  it('turns 7 days of readings into half-day averages, leaving out half-days with none', () => {
    const t = (hoursAgo: number) => Math.floor((NOW.getTime() - hoursAgo * 3_600_000) / 1000);
    const { vals, labels } = weekSeries([[t(200), 1, 1, 1], [t(1), 60, 70, 10], [t(2), 62, 72, null], [t(30), 50, 50, 50]], 1, NOW);
    expect(vals).toEqual([50, 61]);
    expect(labels.at(-1)).toBe('Now');
    expect(weekSeries([], 2, NOW)).toEqual({ vals: [], labels: [] });
  });

  it('writes times and sizes the way the design does', () => {
    expect([ago(null, NOW), ago(min(0.5), NOW), ago(min(5), NOW), ago(min(60), NOW), ago(min(150), NOW), ago(min(1500), NOW), ago(min(14 * 1440), NOW)])
      .toEqual(['Never', 'Just now', '5 min ago', '1 hour ago', '2 hours ago', 'Yesterday', '14 days ago']);
    expect(whenShort(new Date('2026-10-27T02:00:00Z'), NOW)).toBe('Today 02:00');
    expect(whenShort(new Date('2026-10-26T02:00:00Z'), NOW)).toBe('Yesterday 02:00');
    expect(whenShort(new Date('2026-10-23T06:00:00Z'), NOW)).toBe('Fri 07:00'); // UK summer time then
    expect(whenShort(new Date('2026-10-01T06:00:00Z'), NOW)).toBe('01/10 07:00');
    expect([size(339023), size(482869248), size(10214834176), size(null)]).toEqual(['331 KB', '461 MB', '9.5 GB', '—']);
    expect(sizeOf(10214834176, 40424828928)).toBe('9.5 of 37.6 GB');
    expect([duration(25 * 60_000), duration(3 * 3_600_000), duration(12 * 86_400_000)]).toEqual(['25 min', '3 hours', '12 days']);
  });
});
