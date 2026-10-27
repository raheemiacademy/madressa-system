import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, loginIdentity, ownerTotp, session } from '@/db/schema';
import { describeDevice } from '@/lib/device';
import { cookieName, cookiePath, validateSession } from '@/server/auth';
import {
  changeOwnerPassword, completeOwnerSetup, confirmAuthenticatorReset, makeOwnerSetupLink, ownerSessions, ownerSetupView, ownerSignIn, signOutEverywhere, startAuthenticatorReset
} from '@/server/owner/auth';
import { base32, fromBase32, hotp, matchStep, otpauthUrl, stepAt } from '@/server/owner/totp';
import { ownerAreaOnly } from '@/server/next/owner';
import { signInAction } from '@/app/owner/actions';
import { GET as manifest } from '@/app/pwa/[portal]/route';
import { db, resetDb } from './helpers';

const env = { MARKETING_SITE: process.env.MARKETING_SITE, APP_URL: process.env.APP_URL };
beforeAll(() => { process.env.MARKETING_SITE = '1'; process.env.APP_URL = 'https://main.example.org'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const EMAIL = 'owner@example.org';
const PASSWORD = 'a long owner password';
// A little ahead of the clock, so codes used at T0 and later always come after the setup's own code.
const T0 = new Date(Math.ceil(Date.now() / 30_000) * 30_000 + 30_000);
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const codeFor = (key: string, when: Date) => hotp(key.replace(/\s/g, ''), stepAt(when));
const tokenOf = (link: string) => link.split('/').pop()!;

/** A finished setup at T0: returns the authenticator key. */
async function setUp() {
  const link = await makeOwnerSetupLink(db, EMAIL, T0);
  const view = (await ownerSetupView(db, tokenOf(link)))!;
  const r = await completeOwnerSetup(db, tokenOf(link), { password: PASSWORD, confirm: PASSWORD, code: codeFor(view.key, T0) }, {}, T0);
  expect(r.ok).toBe(true);
  return view.key.replace(/\s/g, '');
}
const ownerId = async () => (await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'owner')))[0]!.id;

describe('authenticator codes (RFC 6238)', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  it('matches the RFC test vectors (last 6 digits)', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(hotp(secret, stepAt(new Date(59_000)))).toBe('287082');
    expect(hotp(secret, stepAt(new Date(1_111_111_109_000)))).toBe('081804');
    expect(hotp(secret, stepAt(new Date(1_234_567_890_000)))).toBe('005924');
    expect(fromBase32(secret).toString()).toBe('12345678901234567890');
  });
  it('allows one step of clock drift either side, not two, and never the same step twice', () => {
    const t = stepAt(T0);
    expect(matchStep(secret, hotp(secret, t - 1), T0, null)).toBe(t - 1);
    expect(matchStep(secret, hotp(secret, t + 1), T0, null)).toBe(t + 1);
    expect(matchStep(secret, hotp(secret, t - 2), T0, null)).toBeNull();
    expect(matchStep(secret, hotp(secret, t), T0, t)).toBeNull();
    expect(matchStep(secret, '12345', T0, null)).toBeNull();
  });
  it('makes an otpauth link apps understand', () => {
    expect(otpauthUrl('ABCD', 'o@example.org')).toBe('otpauth://totp/Madressa%20Owner%3Ao%40example.org?secret=ABCD&issuer=Madressa%20Owner&algorithm=SHA1&digits=6&period=30');
  });
});

describe('owner setup (./madrasah owner)', () => {
  it('makes one account with a one-time link, the key stored encrypted, and nothing to sign in with until setup is finished', async () => {
    const link = await makeOwnerSetupLink(db, ' Owner@Example.org ', T0);
    expect(link).toMatch(/^https:\/\/main\.example\.org\/owner\/setup\/[A-Za-z0-9_-]{43}$/);
    const view = (await ownerSetupView(db, tokenOf(link)))!;
    expect(view.email).toBe(EMAIL);
    const [t] = await db.select().from(ownerTotp);
    expect(t!.secret).toBeNull();
    expect(t!.pendingSecret).not.toContain(view.key.replace(/\s/g, ''));
    expect((await ownerSignIn(db, EMAIL, PASSWORD, null, {}, at(5))).ok).toBe(false);
  });

  it('refuses a short password, mismatched passwords and a wrong code, then finishes and signs in', async () => {
    const raw = tokenOf(await makeOwnerSetupLink(db, EMAIL, T0));
    const key = (await ownerSetupView(db, raw))!.key;
    expect(await completeOwnerSetup(db, raw, { password: 'short', confirm: 'short', code: '123456' })).toEqual({ ok: false, errors: { password: 'Use at least 12 characters for the password.' } });
    expect(await completeOwnerSetup(db, raw, { password: PASSWORD, confirm: 'different', code: '12' })).toEqual({ ok: false, errors: { confirm: 'The two passwords don’t match.', code: 'Enter the 6 digits from your authenticator app.' } });
    const wrong = codeFor(key, new Date()) === '000000' ? '111111' : '000000';
    expect((await completeOwnerSetup(db, raw, { password: PASSWORD, confirm: PASSWORD, code: wrong })).ok).toBe(false);
    const r = await completeOwnerSetup(db, raw, { password: PASSWORD, confirm: PASSWORD, code: codeFor(key, new Date()) });
    expect(r.ok && (await validateSession(db, 'owner', r.token))?.identity.email).toBe(EMAIL);
    expect(await ownerSetupView(db, raw)).toBeNull(); // the link works once
    expect((await completeOwnerSetup(db, raw, { password: PASSWORD, confirm: PASSWORD, code: codeFor(key, new Date()) }))).toMatchObject({ ok: false, error: expect.stringContaining('expired') });
  });

  it('refuses an expired link', async () => {
    const raw = tokenOf(await makeOwnerSetupLink(db, EMAIL, new Date(Date.now() - 25 * 3_600_000)));
    expect(await ownerSetupView(db, raw)).toBeNull();
  });

  it('running it again keeps one account, changes the email, signs every device out and starts afresh', async () => {
    await setUp();
    await makeOwnerSetupLink(db, 'new.owner@example.org');
    expect(await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'owner'))).toHaveLength(1);
    expect(await db.select().from(session)).toHaveLength(0);
    expect((await ownerSignIn(db, EMAIL, PASSWORD, null)).ok).toBe(false);
    expect((await ownerSignIn(db, 'new.owner@example.org', PASSWORD, null)).ok).toBe(false); // no password until setup is finished
  });

  it('rejects an email that is not an email', async () => {
    await expect(makeOwnerSetupLink(db, 'not-an-email')).rejects.toThrow('email');
  });
});

describe('owner sign-in', () => {
  it('checks the password on the first screen without signing in, then needs the code', async () => {
    const key = await setUp();
    expect(await ownerSignIn(db, EMAIL, 'wrong password!', null, {}, at(60))).toEqual({ ok: false, error: 'Email or password is incorrect.', field: 'password' });
    expect(await ownerSignIn(db, 'someone@example.org', PASSWORD, null, {}, at(60))).toEqual({ ok: false, error: 'Email or password is incorrect.', field: 'password' });
    expect(await ownerSignIn(db, EMAIL, PASSWORD, null, {}, at(60))).toEqual({ ok: true });
    expect(await db.select().from(session)).toHaveLength(1); // only the one from setup
    const wrong = codeFor(key, at(60)) === '000000' ? '111111' : '000000';
    expect(await ownerSignIn(db, EMAIL, PASSWORD, wrong, {}, at(60))).toMatchObject({ ok: false, field: 'code' });
    expect(await ownerSignIn(db, EMAIL, PASSWORD, '12ab', {}, at(60))).toEqual({ ok: false, error: 'Enter the 6 digits from your authenticator app.', field: 'code' });
    const ok = await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(60)), { ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' }, at(60));
    expect(ok.ok && ok.token).toBeTruthy();
  });

  it('never accepts the same code twice (replay)', async () => {
    const key = await setUp();
    const code = codeFor(key, at(90));
    expect((await ownerSignIn(db, EMAIL, PASSWORD, code, {}, at(90))).ok).toBe(true);
    expect(await ownerSignIn(db, EMAIL, PASSWORD, code, {}, at(91))).toMatchObject({ ok: false, field: 'code' });
  });

  it('locks for 15 minutes after 5 wrong passwords or codes together, even with the right ones', async () => {
    const key = await setUp();
    for (let i = 0; i < 3; i++) await ownerSignIn(db, EMAIL, 'wrong password!', null, {}, at(60));
    await ownerSignIn(db, EMAIL, PASSWORD, '000000' === codeFor(key, at(60)) ? '111111' : '000000', {}, at(60));
    expect(await ownerSignIn(db, EMAIL, 'wrong password!', null, {}, at(60))).toMatchObject({ ok: false, error: 'Too many attempts. Wait 15 minutes, then try again.' });
    expect(await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(120)), {}, at(120))).toMatchObject({ ok: false, error: 'Too many attempts. Wait 15 minutes, then try again.' });
    expect((await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(17 * 60)), {}, at(17 * 60))).ok).toBe(true);
  });

  it('rate-limits attempts from one address (10 in 15 minutes), whatever the account', async () => {
    await setUp();
    for (let i = 0; i < 10; i++) await ownerSignIn(db, `x${i}@example.org`, 'whatever pass', null, { ip: '198.51.100.7' }, at(60));
    expect(await ownerSignIn(db, EMAIL, PASSWORD, null, { ip: '198.51.100.7' }, at(61))).toEqual({ ok: false, error: 'Too many attempts. Wait 15 minutes, then try again.' });
    expect(await ownerSignIn(db, EMAIL, PASSWORD, null, { ip: '198.51.100.8' }, at(61))).toEqual({ ok: true });
  });

  it('gives a session that only the owner area accepts, on its own cookie scoped to /owner', async () => {
    const key = await setUp();
    const r = await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(60)), {}, at(60));
    const token = r.ok ? r.token! : '';
    expect(await validateSession(db, 'admin', token)).toBeNull();
    expect((await validateSession(db, 'owner', token))?.identity.portal).toBe('owner');
    expect([cookieName('owner'), cookiePath('owner')]).toEqual(['sid_owner', '/owner']);
    const s = (await validateSession(db, 'owner', token))!;
    expect(s.expiresAt.getTime() - Date.now()).toBeGreaterThan(13 * 24 * 3_600_000);
  });

  it('records sign-ins and failures in the audit log', async () => {
    const key = await setUp();
    await ownerSignIn(db, EMAIL, 'wrong password!', null, { ip: '203.0.113.9' }, at(60));
    await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(60)), { ip: '203.0.113.9' }, at(60));
    const actions = (await db.select().from(auditLog).where(eq(auditLog.page, 'Owner')).orderBy(auditLog.id)).map((a) => a.action);
    expect(actions).toEqual(['Owner account made from the server: setup link', 'Owner setup finished: password and authenticator set', 'Wrong owner password', 'Signed in to the owner dashboard']);
  });
});

describe('owner account page', () => {
  it('changes the password, signing out every other device but this one', async () => {
    const key = await setUp();
    const id = await ownerId();
    const a = await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(60)), {}, at(60));
    const b = await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(90)), {}, at(90));
    const here = a.ok ? a.token! : '';
    expect(await changeOwnerPassword(db, id, here, { current: '', next: '', repeat: '' })).toEqual({ ok: false, errors: { current: 'Enter your current password.' } });
    expect(await changeOwnerPassword(db, id, here, { current: PASSWORD, next: 'too short', repeat: 'too short' })).toEqual({ ok: false, errors: { next: 'Use at least 12 characters for the new password.' } });
    expect(await changeOwnerPassword(db, id, here, { current: PASSWORD, next: 'another long one', repeat: 'another long two' })).toEqual({ ok: false, errors: { repeat: 'The two new passwords don’t match.' } });
    expect(await changeOwnerPassword(db, id, here, { current: 'not it at all', next: 'another long one', repeat: 'another long one' })).toEqual({ ok: false, errors: { current: 'Your current password is incorrect.' } });
    expect(await changeOwnerPassword(db, id, here, { current: PASSWORD, next: 'another long one', repeat: 'another long one' })).toEqual({ ok: true });
    expect(await validateSession(db, 'owner', here)).not.toBeNull();
    expect(await validateSession(db, 'owner', b.ok ? b.token : '')).toBeNull();
    expect((await ownerSignIn(db, EMAIL, 'another long one', null, {}, at(120))).ok).toBe(true);
  });

  it('resets the authenticator only once a code from the new key works; the old one keeps working until then', async () => {
    const oldKey = await setUp();
    const id = await ownerId();
    const fresh = await startAuthenticatorReset(db, id, EMAIL);
    const newKey = fresh.key.replace(/\s/g, '');
    expect(newKey).not.toBe(oldKey);
    expect((await ownerSignIn(db, EMAIL, PASSWORD, codeFor(oldKey, at(60)), {}, at(60))).ok).toBe(true);
    expect(await confirmAuthenticatorReset(db, id, '12')).toEqual({ ok: false, error: 'Enter the 6 digits from your authenticator app.' });
    expect(await confirmAuthenticatorReset(db, id, codeFor(newKey, at(120)), at(120))).toEqual({ ok: true });
    expect((await ownerSignIn(db, EMAIL, PASSWORD, codeFor(oldKey, at(180)), {}, at(180))).ok).toBe(false);
    expect((await ownerSignIn(db, EMAIL, PASSWORD, codeFor(newKey, at(210)), {}, at(210))).ok).toBe(true);
  });

  it('signs out everywhere, and lists where it is signed in', async () => {
    const key = await setUp();
    const id = await ownerId();
    const a = await ownerSignIn(db, EMAIL, PASSWORD, codeFor(key, at(60)), { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36' }, at(60));
    const list = await ownerSessions(db, id, a.ok ? a.token! : '');
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(describeDevice(list.find((s) => s.current)!.userAgent)).toBe('Chrome on Windows');
    await signOutEverywhere(db, id);
    expect(await db.select().from(session).where(and(eq(session.identityId, id)))).toHaveLength(0);
  });

  it('names devices from their browser', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0')).toBe('Edge on Windows');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(describeDevice(null)).toBe('Unknown device');
  });
});

describe('the owner area exists only on the main site', () => {
  const offMain = async (fn: () => unknown) => {
    delete process.env.MARKETING_SITE;
    try { return await fn(); } finally { process.env.MARKETING_SITE = '1'; }
  };
  const notFoundDigest = async (fn: () => unknown) => { try { await fn(); return 'rendered'; } catch (e) { return String((e as { digest?: string }).digest); } };

  it('every /owner page is not found on a madrasah copy', async () => {
    expect(await offMain(() => notFoundDigest(ownerAreaOnly))).toMatch(/404|NOT_FOUND/);
    expect(await notFoundDigest(ownerAreaOnly)).toBe('rendered');
  });

  it('sign-in is refused on a madrasah copy', async () => {
    await setUp();
    expect(await offMain(() => notFoundDigest(() => signInAction(undefined, new FormData())))).toMatch(/404|NOT_FOUND/);
  });

  it('the owner home-screen manifest is not found on a madrasah copy', async () => {
    const get = () => manifest(new Request('http://x/pwa/owner'), { params: Promise.resolve({ portal: 'owner' }) });
    expect((await get()).status).toBe(200);
    expect((await offMain(get) as Response).status).toBe(404);
  });

  it('the setup script refuses to run on a madrasah copy', async () => {
    const { execFileSync } = await import('node:child_process');
    const run = () => execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/owner-setup.ts', EMAIL], { env: { ...process.env, MARKETING_SITE: '' }, stdio: 'pipe' });
    expect(run).toThrow(/not the main site/);
  });
});
