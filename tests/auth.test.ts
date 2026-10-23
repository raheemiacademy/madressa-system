import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { loginIdentity, session } from '@/db/schema';
import { createSession, LOCKOUT_MS, login, MAX_FAILED_ATTEMPTS, passwordProblem, SESSION_TTL_MS, validateSession } from '@/server/auth';
import { db, makeStaff, PASSWORD, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => sql.end());

describe('login', () => {
  it('signs in with the right password and stores only a hash of the token', async () => {
    const { identity } = await makeStaff({ email: 'office@example.org' });
    const r = await login(db, 'admin', ' Office@Example.org ', PASSWORD, { ip: '10.0.0.1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rows = await db.select().from(session);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(r.token);
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect((await validateSession(db, 'admin', r.token))?.identity.id).toBe(identity.id);
  });

  it('gives the same message for an unknown email and a wrong password', async () => {
    await makeStaff({ email: 'office@example.org' });
    const a = await login(db, 'admin', 'nobody@example.org', PASSWORD, { ip: '10.0.0.2' });
    const b = await login(db, 'admin', 'office@example.org', 'wrong password!', { ip: '10.0.0.2' });
    expect(a).toEqual(b);
    expect(a.ok).toBe(false);
  });

  it('locks the account after repeated failures, then unlocks after the lockout', async () => {
    await makeStaff({ email: 'office@example.org' });
    const t0 = new Date('2026-10-23T10:00:00Z');
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await login(db, 'admin', 'office@example.org', 'nope nope nope', { ip: `10.1.0.${i}` }, t0);
    const locked = await login(db, 'admin', 'office@example.org', PASSWORD, { ip: '10.1.1.1' }, t0);
    expect(locked).toMatchObject({ ok: false, error: expect.stringMatching(/Too many attempts/) });
    const later = await login(db, 'admin', 'office@example.org', PASSWORD, { ip: '10.1.1.1' }, new Date(t0.getTime() + LOCKOUT_MS + 1000));
    expect(later.ok).toBe(true);
  });

  it('rate-limits one IP across many accounts', async () => {
    const t0 = new Date('2026-10-23T10:00:00Z');
    let last;
    for (let i = 0; i < 31; i++) last = await login(db, 'admin', `x${i}@example.org`, 'whatever pw', { ip: '10.9.9.9' }, t0);
    expect(last).toMatchObject({ ok: false, error: expect.stringMatching(/Too many attempts/) });
  });

  it('refuses accounts with login turned off', async () => {
    await makeStaff({ email: 'off@example.org' }, { allowLogin: false });
    expect((await login(db, 'admin', 'off@example.org', PASSWORD, { ip: '10.0.0.3' })).ok).toBe(false);
  });

  it('enforces the password rule', () => {
    expect(passwordProblem('short')).toMatch(/10 characters/);
    expect(passwordProblem('long enough pass')).toBeNull();
  });
});

describe('sessions', () => {
  it('only works on the portal it was issued for', async () => {
    const { identity } = await makeStaff();
    const { token } = await createSession(db, identity.id, 'admin');
    for (const p of ['teacher', 'parent', 'student'] as const) expect(await validateSession(db, p, token)).toBeNull();
    expect(await validateSession(db, 'admin', token)).not.toBeNull();
  });

  it('rejects unknown and oversized tokens', async () => {
    expect(await validateSession(db, 'admin', 'not-a-token')).toBeNull();
    expect(await validateSession(db, 'admin', 'x'.repeat(500))).toBeNull();
    expect(await validateSession(db, 'admin', undefined)).toBeNull();
  });

  it('expires, and deletes the expired row', async () => {
    const { identity } = await makeStaff();
    const { token, expiresAt } = await createSession(db, identity.id, 'admin');
    expect(await validateSession(db, 'admin', token, new Date(expiresAt.getTime() + 1))).toBeNull();
    expect(await db.select().from(session)).toHaveLength(0);
  });

  it('slides the expiry once half the lifetime has passed', async () => {
    const { identity } = await makeStaff();
    const { token, expiresAt } = await createSession(db, identity.id, 'admin');
    const early = await validateSession(db, 'admin', token, new Date(Date.now() + 1000));
    expect(early?.expiresAt.getTime()).toBe(expiresAt.getTime());
    const late = new Date(expiresAt.getTime() - SESSION_TTL_MS.admin / 4);
    const slid = await validateSession(db, 'admin', token, late);
    expect(slid?.expiresAt.getTime()).toBe(late.getTime() + SESSION_TTL_MS.admin);
  });

  it('ends at once when login is turned off', async () => {
    const { identity } = await makeStaff();
    const { token } = await createSession(db, identity.id, 'admin');
    await db.update(loginIdentity).set({ allowLogin: false }).where(eq(loginIdentity.id, identity.id));
    expect(await validateSession(db, 'admin', token)).toBeNull();
  });
});
