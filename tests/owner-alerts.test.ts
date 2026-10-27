import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, loginIdentity, mailQueue, ownerAlert, ownerCheck, pushQueue, pushSubscription } from '@/db/schema';
import { sendContactMessage } from '@/server/contact';
import { signUpForEarlyAccess } from '@/server/early-access';
import { alertHistory, alertSettings, clearAlert, evaluateAlerts, ownerTick, raiseAlert, saveAlertSettings } from '@/server/owner/alerts';
import { makeOwnerSetupLink } from '@/server/owner/auth';
import { type Health, ownerState } from '@/server/owner/checks';
import { db, makeStaff, resetDb } from './helpers';

const env = { MARKETING_SITE: process.env.MARKETING_SITE, OWNER_HEALTH_FILE: process.env.OWNER_HEALTH_FILE, OWNER_SUMMARY_TOKEN: process.env.OWNER_SUMMARY_TOKEN, EARLY_ACCESS_NOTIFY_EMAIL: process.env.EARLY_ACCESS_NOTIFY_EMAIL };
const dir = mkdtempSync(path.join(tmpdir(), 'owner-alerts-'));
beforeAll(() => { process.env.MARKETING_SITE = '1'; process.env.OWNER_SUMMARY_TOKEN = 't'.repeat(40); process.env.OWNER_HEALTH_FILE = path.join(dir, 'health.json'); process.env.EARLY_ACCESS_NOTIFY_EMAIL = 'notify@example.org'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const ACTOR = { identityId: null as unknown as number, name: 'Owner' };
const NOW = new Date('2026-10-27T14:00:00Z');
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);
let ip = 0;

/** The owner account, with push turned on for one device. */
async function owner() {
  await makeOwnerSetupLink(db, 'owner@example.org');
  const [o] = await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'owner'));
  await db.insert(pushSubscription).values({ identityId: o!.id, endpoint: 'https://push.example.org/owner-phone', p256dh: 'p', auth: 'a' });
  return o!.id;
}
const health = (over: Partial<Health> = {}): Health => ({
  generatedAt: NOW.toISOString(), disk: { usedBytes: 10, totalBytes: 40 }, memory: { usedBytes: 2, totalBytes: 4 }, containers: [],
  madrasahs: [{ name: 'demo', url: null, internal: 'http://127.0.0.1:9', backup: { at: '2026-10-27T02:00:00Z', sizeBytes: 1, databaseBytes: 1 } }],
  history: [], errors: [], ...over
});
const check = (minutesFromNow: number, ok: boolean) => ({ madrasah: 'demo', at: min(minutesFromNow), ok, summary: ok ? { version: '1.2', counts: { students: 1, teachers: 1, staff: 1, parents: 1, parentsWithLogin: 1 }, lastActiveAt: NOW.toISOString() } : null });

describe('alert settings', () => {
  it('start with every alert on and no email, and save what’s chosen', async () => {
    expect(await alertSettings(db)).toEqual({ on: { down: true, back: true, backup: true, server: true, signup: true, contact: true }, email: null });
    const on = { down: true, back: false, backup: true, server: true, signup: true, contact: false };
    expect(await saveAlertSettings(db, ACTOR, { on, email: ' Me@Example.org ' })).toEqual({ ok: true });
    expect(await alertSettings(db)).toEqual({ on, email: 'me@example.org' });
    expect(await saveAlertSettings(db, ACTOR, { on, email: 'not an email' })).toEqual({ ok: false, error: 'Enter an email address like name@example.org, or leave it empty.' });
    expect(await saveAlertSettings(db, ACTOR, { on, email: '' })).toEqual({ ok: true });
    expect((await alertSettings(db)).email).toBeNull();
    expect((await db.select().from(auditLog)).map((a) => a.action)).toEqual(['Changed the owner alert settings', 'Changed the owner alert settings']);
  });
});

describe('sending alerts', () => {
  const a = { kind: 'down' as const, key: 'down:demo', about: 'demo', title: 'Not responding (2 checks)', url: '/owner/madrasahs/demo' };

  it('pushes to the owner’s devices only, and holds back repeats until the problem clears', async () => {
    const id = await owner();
    // Someone else with push on: a school admin. They never get the owner's alerts.
    const admin = await makeStaff();
    await db.insert(pushSubscription).values({ identityId: admin.identity.id, endpoint: 'https://push.example.org/admin-phone', p256dh: 'p', auth: 'a' });
    expect(await raiseAlert(db, a, { now: NOW })).toBe(true);
    expect(await raiseAlert(db, a, { now: min(5) })).toBe(false);
    expect(await db.select({ identityId: pushQueue.identityId, title: pushQueue.title, body: pushQueue.body, url: pushQueue.url }).from(pushQueue))
      .toEqual([{ identityId: id, title: 'demo', body: 'Not responding (2 checks)', url: '/owner/madrasahs/demo' }]);
    expect((await db.select().from(ownerAlert)).map((r) => [r.channels, r.clearedAt])).toEqual([['Push', null]]);
    expect((await clearAlert(db, 'down:demo', min(15)))?.toISOString()).toBe(NOW.toISOString());
    expect(await raiseAlert(db, a, { now: min(30) })).toBe(true); // a new problem later is a new alert
    expect(await db.select().from(ownerAlert)).toHaveLength(2);
  });

  it('emails the alert address too (queued; log-only until email is connected), and records when an alert is turned off', async () => {
    await owner();
    await saveAlertSettings(db, ACTOR, { on: { down: true, back: true, backup: false, server: true, signup: true, contact: true }, email: 'me@example.org' });
    await raiseAlert(db, a, { now: NOW });
    await raiseAlert(db, { kind: 'backup', key: 'backup:demo', about: 'demo', title: 'No backup yet', url: '/owner/server' }, { now: NOW });
    expect((await db.select().from(ownerAlert).orderBy(ownerAlert.id)).map((r) => r.channels)).toEqual(['Push and email', 'Not sent']);
    const mails = await db.select().from(mailQueue).where(eq(mailQueue.entity, 'owner_alert'));
    expect(mails.map((m) => [m.toEmail, m.subject])).toEqual([['me@example.org', 'Madressa Owner: demo — Not responding (2 checks)']]);
    expect(await db.select().from(pushQueue)).toHaveLength(1);
  });

  it('with no device and no email, the alert is still in the history', async () => {
    await raiseAlert(db, a, { now: NOW });
    expect((await alertHistory(db)).rows.map((r) => r.channels)).toEqual(['Not sent']);
  });
});

describe('what raises and clears alerts', () => {
  it('down, still down (no repeat), then back: the down alert clears and “back” is sent', async () => {
    await owner();
    await db.insert(ownerCheck).values([check(-5, false), check(0, false)]);
    await evaluateAlerts(db, await ownerState(db, health(), NOW));
    await db.insert(ownerCheck).values(check(5, false));
    await evaluateAlerts(db, await ownerState(db, health(), min(5)));
    await db.insert(ownerCheck).values(check(20, true));
    await evaluateAlerts(db, await ownerState(db, health(), min(20)));
    const rows = await db.select().from(ownerAlert).orderBy(ownerAlert.id);
    expect(rows.map((r) => [r.kind, r.title, r.clearedAt?.toISOString() ?? null])).toEqual([
      ['down', 'Not responding (2 checks)', min(20).toISOString()],
      ['back', 'Responding again after 20 minutes', min(20).toISOString()]
    ]);
    expect((await db.select().from(pushQueue)).map((p) => p.body)).toEqual(['Not responding (2 checks)', 'Responding again after 20 minutes']);
  });

  it('a late backup and a full disk raise once, and clear when they’re fine again', async () => {
    await db.insert(ownerCheck).values(check(0, true));
    const late = health({ disk: { usedBytes: 36, totalBytes: 40 }, madrasahs: [{ ...health().madrasahs![0]!, backup: { at: '2026-10-26T02:00:00Z', sizeBytes: 1, databaseBytes: 1 } }] });
    await evaluateAlerts(db, await ownerState(db, late, NOW));
    await evaluateAlerts(db, await ownerState(db, late, min(5)));
    expect((await db.select().from(ownerAlert).orderBy(ownerAlert.id)).map((r) => [r.key, r.title])).toEqual([['backup:demo', 'Backup over 26 hours old'], ['disk', 'Server disk over 85% (90%)']]);
    await evaluateAlerts(db, await ownerState(db, health(), min(10)));
    expect((await db.select().from(ownerAlert)).every((r) => r.clearedAt)).toBe(true);
  });

  it('a new contact message or sign-up is sent at once, and isn’t emailed twice to the address that got the notice', async () => {
    await owner();
    await saveAlertSettings(db, ACTOR, { on: { down: true, back: true, backup: true, server: true, signup: true, contact: true }, email: 'notify@example.org' });
    await sendContactMessage(db, { name: 'Sample Person', email: 'p@example.org', topic: 'Early access', message: 'Hello' }, `198.51.100.${++ip}`);
    await signUpForEarlyAccess(db, { school: 'Masjid Bilal Maktab', name: 'Sample Head', role: 'Administrator', email: 'h@example.org', type: 'Hifz or alim academy' }, `198.51.100.${++ip}`);
    const rows = await db.select().from(ownerAlert).orderBy(ownerAlert.id);
    expect(rows.map((r) => [r.kind, r.about, r.title, r.channels, r.clearedAt?.getTime() === r.sentAt.getTime()])).toEqual([
      ['contact', 'Sample Person', 'New contact message', 'Push and email', true],
      ['signup', 'Masjid Bilal Maktab', 'New early-access sign-up', 'Push and email', true]
    ]);
    expect(await db.select().from(mailQueue).where(eq(mailQueue.entity, 'owner_alert'))).toHaveLength(0); // the leads' own notices went instead
    expect((await db.select().from(pushQueue)).map((p) => p.url)).toEqual(rows.map((r) => `/owner/leads/${r.key.slice(5)}`));
  });

  it('the worker checks, sees a madrasah that won’t answer, and alerts after the second check', async () => {
    await owner();
    writeFileSync(process.env.OWNER_HEALTH_FILE!, JSON.stringify(health()));
    await ownerTick(db, NOW);
    expect(await db.select().from(ownerAlert)).toHaveLength(0); // one missed check isn't "down" yet
    await ownerTick(db, min(5));
    const [alert] = await db.select().from(ownerAlert);
    expect(alert).toMatchObject({ kind: 'down', about: 'demo', title: 'Not responding (2 checks)', channels: 'Push' });
  });
});
