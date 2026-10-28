import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, loginIdentity, ownerAction, ownerAlert, ownerCheck } from '@/db/schema';
import { GET } from '@/app/api/owner/setup-code/route';
import { changeLine } from '@/app/owner/(app)/madrasahs/change-line';
import { evaluateAlerts, raiseAlert } from '@/server/owner/alerts';
import { completeOwnerSetup, makeOwnerSetupLink, ownerSetupView } from '@/server/owner/auth';
import { type Health, ownerState, runChecks } from '@/server/owner/checks';
import { requestAction } from '@/server/owner/safe-actions';
import { fetchSetupCode, recentChanges, requestAdd, requestChange, setupCodeAnswer, suggestedAddress } from '@/server/owner/manage';
import { hotp, stepAt } from '@/server/owner/totp';
import { db, makeStaff, PASSWORD, resetDb } from './helpers';

const TOKEN = 'x'.repeat(40);
const env = { OWNER_SUMMARY_TOKEN: process.env.OWNER_SUMMARY_TOKEN, APP_URL: process.env.APP_URL, SETUP_CODE: process.env.SETUP_CODE };
beforeAll(() => { process.env.OWNER_SUMMARY_TOKEN = TOKEN; process.env.APP_URL = 'https://main.example.org'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

// A little ahead of the clock, so codes used at T0 and later always come after the setup's own code.
const T0 = new Date(Math.ceil(Date.now() / 30_000) * 30_000 + 30_000);
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const SERVER = '203.0.113.10';
const dns: Record<string, string[]> = { 'main.example.org': [SERVER], 'flc.main.example.org': [SERVER], 'raheemi.example.co.uk': [SERVER], 'elsewhere.example.com': ['198.51.100.1'] };
const resolver = async (host: string) => { if (!dns[host]) throw new Error('ENOTFOUND'); return dns[host]; };
const demo = { name: 'demo', url: 'https://demo.main.example.org', internal: 'http://ma-demo:3000', backup: null };
const health = (paused = false): Health => ({ generatedAt: T0.toISOString(), madrasahs: [{ ...demo, paused }], history: [], errors: [] });
const audits = async () => (await db.select().from(auditLog).orderBy(auditLog.id)).map((a) => a.action);
const requests = async () => (await db.select().from(ownerAction).orderBy(ownerAction.id)).map((a) => [a.madrasah, a.action, a.address, a.demo]);

/** The owner account with its authenticator set up at T0: returns the actor and the key. */
async function owner() {
  const raw = (await makeOwnerSetupLink(db, 'owner@example.org', T0)).split('/').pop()!;
  const key = (await ownerSetupView(db, raw))!.key.replace(/\s/g, '');
  expect((await completeOwnerSetup(db, raw, { password: PASSWORD, confirm: PASSWORD, code: hotp(key, stepAt(T0)) }, {}, T0)).ok).toBe(true);
  const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'owner'));
  return { actor: { identityId: idn!.id, name: 'Owner' }, code: (when: Date) => hotp(key, stepAt(when)) };
}
const ACTOR = { identityId: null as unknown as number, name: 'Owner' };

describe('adding a madrasah', () => {
  it('queues a real one or a demo, at the suggested address unless another is given, and records it', async () => {
    expect(suggestedAddress('flc')).toBe('flc.main.example.org');
    expect(await requestAdd(db, ACTOR, health(), { name: ' FLC ', address: '', demo: false }, T0, resolver)).toEqual({ ok: true });
    expect(await requestAdd(db, ACTOR, health(), { name: 'raheemi', address: 'https://Raheemi.example.co.uk/', demo: true }, T0, resolver)).toEqual({ ok: true });
    expect(await requests()).toEqual([['flc', 'add', 'flc.main.example.org', false], ['raheemi', 'add', 'raheemi.example.co.uk', true]]);
    expect(await audits()).toEqual(['Asked the server to add flc at flc.main.example.org', 'Asked the server to add raheemi at raheemi.example.co.uk (demo with sample data)']);
  });

  it('refuses names and addresses the server script would refuse, or that are already in use', async () => {
    const add = (name: string, address = '') => requestAdd(db, ACTOR, health(), { name, address }, T0, resolver);
    const NAME = 'Use 2 to 30 lowercase letters, digits or dashes, starting with a letter or digit.';
    for (const bad of ['', 'a', '-flc', 'flc; rm -rf /', 'x'.repeat(31), 'fl c']) expect(await add(bad, 'raheemi.example.co.uk')).toEqual({ ok: false, errors: { name: NAME } });
    expect(await add('demo', 'raheemi.example.co.uk')).toEqual({ ok: false, errors: { name: 'There’s already a madrasah called that.' } });
    expect(await add('main', 'raheemi.example.co.uk')).toEqual({ ok: false, errors: { name: 'There’s already a madrasah called that.' } });
    for (const bad of ['not an address', 'flc.example.org; reboot', 'localhost']) expect(await add('flc', bad)).toEqual({ ok: false, errors: { address: 'Enter a web address like flc.example.co.uk.' } });
    expect(await add('flc', 'main.example.org')).toEqual({ ok: false, errors: { address: 'Another site already uses that address.' } });
    expect(await add('flc', 'demo.main.example.org')).toEqual({ ok: false, errors: { address: 'Another site already uses that address.' } });
    expect(await requestAdd(db, ACTOR, null, { name: 'flc' }, T0, resolver)).toMatchObject({ ok: false, error: expect.stringContaining('health file') });
    expect(await requests()).toEqual([]);
  });

  it('checks the address points at this server first, so the HTTPS certificate can be issued', async () => {
    const r = await requestAdd(db, ACTOR, health(), { name: 'flc', address: 'elsewhere.example.com' }, T0, resolver);
    expect(r).toEqual({ ok: false, errors: { address: `elsewhere.example.com doesn’t point at this server yet. Add an A record for it pointing to ${SERVER}, wait a few minutes, then try again.` } });
    expect(await requestAdd(db, ACTOR, health(), { name: 'flc', address: 'nowhere.example.com' }, T0, resolver)).toMatchObject({ ok: false, errors: { address: expect.stringContaining('doesn’t point at this server') } });
    expect(await requests()).toEqual([]);
  });

  it('doesn’t queue the same name twice while the first is waiting', async () => {
    await requestAdd(db, ACTOR, health(), { name: 'flc' }, T0, resolver);
    expect(await requestAdd(db, ACTOR, health(), { name: 'flc' }, at(30), resolver)).toEqual({ ok: false, errors: { name: 'That madrasah is already being added.' } });
  });
});

describe('pausing, resuming and removing', () => {
  it('pauses a running one and resumes a paused one, never both ways round', async () => {
    expect(await requestChange(db, ACTOR, health(), 'demo', 'resume', {}, T0)).toEqual({ ok: false, error: 'demo isn’t paused.' });
    expect(await requestChange(db, ACTOR, health(), 'demo', 'suspend', {}, T0)).toEqual({ ok: true });
    expect(await requestChange(db, ACTOR, health(true), 'demo', 'resume', {}, at(5))).toEqual({ ok: false, error: 'Something for demo is already waiting for the server. Try again when it’s done.' });
    await db.update(ownerAction).set({ startedAt: T0, finishedAt: T0, result: 'Done' });
    expect(await requestChange(db, ACTOR, health(true), 'demo', 'suspend', {}, at(10))).toEqual({ ok: false, error: 'demo is already paused.' });
    expect(await requestChange(db, ACTOR, health(true), 'demo', 'resume', {}, at(10))).toEqual({ ok: true });
    expect(await audits()).toEqual(['Asked the server to pause demo', 'Asked the server to resume demo']);
    expect(await requestAction(db, ACTOR, health(true), 'demo', 'restart', at(20))).toEqual({ ok: false, error: 'demo is paused. Resume it instead.' });
    expect((await requestAction(db, ACTOR, health(true), 'demo', 'backup', at(20))).ok).toBe(true); // backups still work while paused
  });

  it('refuses the main site, names not on the server and other actions', async () => {
    expect(await requestChange(db, ACTOR, health(), 'main', 'suspend', {}, T0)).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(await requestChange(db, ACTOR, health(), 'nope', 'remove', { typed: 'nope', code: '123456' }, T0)).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(await requestChange(db, ACTOR, health(), 'demo', 'restart', {}, T0)).toEqual({ ok: false, error: 'Unknown action.' });
    expect(await requests()).toEqual([]);
  });

  it('removes only with the name typed exactly and a fresh authenticator code, which works once', async () => {
    const o = await owner();
    expect(await requestChange(db, o.actor, health(), 'demo', 'remove', { typed: 'Demo', code: o.code(at(60)) }, at(60))).toEqual({ ok: false, error: 'Type demo exactly to confirm.' });
    expect(await requestChange(db, o.actor, health(), 'demo', 'remove', { typed: 'demo', code: '12345' }, at(60))).toEqual({ ok: false, error: 'Enter the 6 digits from your authenticator app.' });
    const wrong = o.code(at(60)) === '000000' ? '111111' : '000000';
    expect(await requestChange(db, o.actor, health(), 'demo', 'remove', { typed: 'demo', code: wrong }, at(60))).toMatchObject({ ok: false, error: expect.stringContaining('didn’t work') });
    expect(await requests()).toEqual([]);
    expect(await requestChange(db, o.actor, health(), 'demo', 'remove', { typed: 'demo', code: o.code(at(60)) }, at(60))).toEqual({ ok: true });
    expect(await requests()).toEqual([['demo', 'remove', null, false]]);
    await db.delete(ownerAction);
    expect(await requestChange(db, o.actor, health(), 'demo', 'remove', { typed: 'demo', code: o.code(at(60)) }, at(61))).toMatchObject({ ok: false }); // the same code again
    expect((await audits()).slice(-3)).toEqual(['Wrong authenticator code when confirming', 'Asked the server to remove demo', 'Wrong authenticator code when confirming']);
  });

  it('lists the day’s changes in a few words', async () => {
    await requestAdd(db, ACTOR, health(), { name: 'flc', demo: true }, T0, resolver);
    await requestChange(db, ACTOR, health(), 'demo', 'suspend', {}, T0);
    await db.update(ownerAction).set({ startedAt: T0, finishedAt: T0, result: 'Failed: no such madrasah' }).where(eq(ownerAction.action, 'suspend'));
    const fmt = () => '17:00';
    const lines = (await recentChanges(db, at(60))).map((c) => [c.madrasah, changeLine(c, fmt)]);
    expect(lines).toContainEqual(['flc', { state: 'Waiting', tone: 'off', text: '· adding at flc.main.example.org (demo), asked at 17:00; waiting for the server.' }]);
    expect(lines).toContainEqual(['demo', { state: 'Failed', tone: 'bad', text: '· pausing: Failed: no such madrasah (17:00).' }]);
    expect(await recentChanges(db, new Date(T0.getTime() + 2 * 86_400_000))).toEqual([]);
  });
});

describe('the setup code for a new madrasah’s first admin', () => {
  const get = (headers: Record<string, string>) => GET(new Request('http://ma-demo:3000/api/owner/setup-code', { headers }));
  const internal = { host: 'ma-demo:3000', 'x-forwarded-for': '172.18.0.5', 'x-forwarded-host': 'ma-demo:3000' };

  it('is given only with the token, only on the private network, and only until the first admin exists', async () => {
    process.env.SETUP_CODE = 'abcdef123456';
    try {
      expect((await get(internal)).status).toBe(401);
      expect((await get({ host: 'main.example.org', 'x-forwarded-for': '203.0.113.7', authorization: `Bearer ${TOKEN}` })).status).toBe(403);
      const r = await get({ ...internal, authorization: `Bearer ${TOKEN}` });
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(await r.json()).toEqual({ code: 'abcdef123456' });
      await makeStaff({ name: 'First Head', isSuper: true });
      expect(await setupCodeAnswer(db)).toEqual({ code: null, reason: 'set up' });
    } finally { delete process.env.SETUP_CODE; }
    expect(await setupCodeAnswer(db)).toEqual({ code: null, reason: 'none' }); // a demo copy has none
  });

  it('is fetched by the main site from the madrasah’s own copy, and looking at it is logged', async () => {
    let asked = '';
    const answer = (body: unknown, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => {
      asked = `${url} ${(init?.headers as Record<string, string>).authorization}`;
      return Response.json(body, { status });
    }) as typeof fetch;
    expect(await fetchSetupCode(db, ACTOR, health(), 'demo', answer({ code: 'abcdef123456' }))).toEqual({ ok: true, code: 'abcdef123456', url: 'https://demo.main.example.org/admin/setup' });
    expect(asked).toBe(`http://ma-demo:3000/api/owner/setup-code Bearer ${TOKEN}`);
    expect(await fetchSetupCode(db, ACTOR, health(), 'demo', answer({ code: null, reason: 'set up' }))).toEqual({ ok: false, error: 'demo is already set up: its first admin has signed up.' });
    expect(await fetchSetupCode(db, ACTOR, health(), 'demo', answer({ code: '<script>' }))).toMatchObject({ ok: false });
    expect(await fetchSetupCode(db, ACTOR, health(), 'demo', answer({}, 401))).toEqual({ ok: false, error: 'demo couldn’t answer (401).' });
    expect(await fetchSetupCode(db, ACTOR, health(), 'nope', answer({ code: 'abcdef123456' }))).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(await audits()).toEqual(['Looked at the setup code for demo']);
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain('abcdef123456');
  });
});

describe('a paused or removed madrasah on the dashboard', () => {
  it('isn’t checked while paused, shows as paused rather than down, and raises no alerts', async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return new Response(null, { status: 502 }); }) as typeof fetch;
    expect(await runChecks(db, health(true), T0, fetcher)).toBe(0);
    expect(calls).toBe(0);
    await db.insert(ownerCheck).values([{ madrasah: 'demo', at: new Date(T0.getTime() - 600_000), ok: false, error: 'x' }, { madrasah: 'demo', at: new Date(T0.getTime() - 300_000), ok: false, error: 'x' }]);
    await raiseAlert(db, { kind: 'down', key: 'down:demo', about: 'demo', title: 'Not responding', url: '/owner/madrasahs/demo' }, { now: T0 });
    const s = await ownerState(db, health(true), T0);
    expect(s.madrasahs[0]).toMatchObject({ status: 'paused', attention: null });
    expect(s.attentionCount).toBe(0);
    await evaluateAlerts(db, s);
    const open = await db.select().from(ownerAlert);
    expect(open.find((a) => a.key === 'down:demo')?.clearedAt).not.toBeNull();
    expect(open.some((a) => a.kind === 'back')).toBe(false); // no "responding again" news for a pause
  });

  it('clears a removed madrasah’s alerts, but not when the health file can’t be read', async () => {
    await raiseAlert(db, { kind: 'backup', key: 'backup:gone', about: 'gone', title: 'No backup yet', url: '/owner/server' }, { now: T0 });
    await evaluateAlerts(db, await ownerState(db, null, T0));
    expect((await db.select().from(ownerAlert))[0]!.clearedAt).toBeNull();
    await evaluateAlerts(db, await ownerState(db, health(), T0));
    expect((await db.select().from(ownerAlert)).find((a) => a.key === 'backup:gone')!.clearedAt).not.toBeNull();
  });
});
