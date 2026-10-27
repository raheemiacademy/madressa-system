import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminStaff, auditLog, loginIdentity, session } from '@/db/schema';
import { SUPPORT_ADMIN } from '@/lib/support';
import { createSession, login, validateSession } from '@/server/auth';
import { needsFirstAdmin, setUpSchool } from '@/server/onboarding';
import { ownerAdminLink } from '@/server/owner/admin-link';
import { redeemPasswordLink } from '@/server/password-links';
import { deleteStaff, saveStaff, SUPPORT_LOCKED } from '@/server/staff';
import { ensureSupportAdmin, isSupportStaff, supportStaffId, supportTick } from '@/server/support';
import { db, makeStaff, PASSWORD, resetDb } from './helpers';

const env = { SETUP_CODE: process.env.SETUP_CODE, APP_URL: process.env.APP_URL, MARKETING_SITE: process.env.MARKETING_SITE };
beforeAll(() => { process.env.SETUP_CODE = 'setup-code-1234'; process.env.APP_URL = 'https://demo.example.org'; delete process.env.MARKETING_SITE; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const SUPPORT = { name: 'Madressa Support', email: 'Support@Example.org' };
const support = async () => (await db.select().from(adminStaff).where(eq(adminStaff.id, (await supportStaffId(db))!)))[0]!;
const identityOf = async (staffId: number) => (await db.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, staffId)))[0]!;

describe('the remote support account', () => {
  it('is set in one place, blank until you give the email, and nothing is made while it’s blank', async () => {
    expect(SUPPORT_ADMIN.name).toBe('Madressa Support');
    expect(await ensureSupportAdmin(db, { name: 'Madressa Support', email: '  ' })).toBe('no email set');
    expect(await db.select().from(adminStaff)).toHaveLength(0);
  });

  it('is a super admin with no password, made once, then left alone', async () => {
    expect(await ensureSupportAdmin(db, SUPPORT)).toBe('added');
    const s = await support();
    expect(s).toMatchObject({ name: 'Madressa Support', email: 'support@example.org', isSuper: true, role: 'Remote support' });
    expect(await identityOf(s.id)).toMatchObject({ portal: 'admin', email: 'support@example.org', passwordHash: null, allowLogin: true });
    expect(await ensureSupportAdmin(db, SUPPORT)).toBe('unchanged');
    expect(await db.select().from(adminStaff)).toHaveLength(1);
    expect((await db.select().from(auditLog)).map((a) => [a.actorName, a.action])).toEqual([['Madressa (automatic)', 'Added Madressa’s remote support account (support@example.org)']]);
    expect((await login(db, 'admin', 'support@example.org', 'anything at all')).ok).toBe(false); // no password: no way in without a link
  });

  it('changing the email moves the account to the new address, and the old password and devices stop working', async () => {
    await ensureSupportAdmin(db, SUPPORT);
    const s = await support();
    await db.update(loginIdentity).set({ passwordHash: 'old hash' }).where(eq(loginIdentity.adminStaffId, s.id));
    await createSession(db, (await identityOf(s.id)).id, 'admin');
    expect(await ensureSupportAdmin(db, { ...SUPPORT, email: 'help@example.org' })).toBe('updated');
    expect((await support()).id).toBe(s.id);
    expect(await identityOf(s.id)).toMatchObject({ email: 'help@example.org', passwordHash: null });
    expect(await db.select().from(session)).toHaveLength(0);
  });

  it('puts back what a school changed directly (super, allowed to sign in)', async () => {
    await ensureSupportAdmin(db, SUPPORT);
    const s = await support();
    await db.update(adminStaff).set({ isSuper: false }).where(eq(adminStaff.id, s.id));
    await db.update(loginIdentity).set({ allowLogin: false }).where(eq(loginIdentity.adminStaffId, s.id));
    expect(await ensureSupportAdmin(db, SUPPORT)).toBe('updated');
    expect((await support()).isSuper).toBe(true);
    expect((await identityOf(s.id)).allowLogin).toBe(true);
  });

  it('takes over a staff member who already has that email, rather than making a second one', async () => {
    const mine = await makeStaff({ name: 'Owner Myself', email: 'support@example.org' });
    expect(await ensureSupportAdmin(db, SUPPORT)).toBe('updated');
    expect(await supportStaffId(db)).toBe(mine.staff.id);
    expect(await db.select().from(adminStaff)).toHaveLength(1);
  });

  it('is added when a madrasah starts, but never on the main site', async () => {
    process.env.MARKETING_SITE = '1';
    try { await supportTick(db); } finally { delete process.env.MARKETING_SITE; }
    expect(await db.select().from(adminStaff)).toHaveLength(0);
  });
});

describe('the school can see it but not change it', () => {
  it('refuses edits and deletes, even by a super admin', async () => {
    const head = await makeStaff({ name: 'Head', isSuper: true });
    await ensureSupportAdmin(db, SUPPORT);
    const id = (await support()).id;
    expect(await isSupportStaff(db, id)).toBe(true);
    expect(await saveStaff(db, head.actor, { name: 'Renamed', email: 'me@example.org', allowLogin: 'on' }, id)).toEqual({ ok: false, errors: { name: SUPPORT_LOCKED } });
    expect(await deleteStaff(db, head.actor, id)).toEqual({ ok: false, error: SUPPORT_LOCKED });
    expect((await support()).name).toBe('Madressa Support');
  });

  it('doesn’t count as one of the school’s super admins, so they can’t leave only Madressa in charge', async () => {
    const head = await makeStaff({ name: 'Head', email: 'head@example.org', isSuper: true });
    await ensureSupportAdmin(db, SUPPORT);
    const r = await saveStaff(db, head.actor, { name: 'Head', email: 'head@example.org', allowLogin: 'on' }, head.staff.id); // dropping their own super
    expect(r).toEqual({ ok: false, errors: { isSuper: 'You are the only super admin. Make someone else super first.' } });
  });

  it('doesn’t stop a new madrasah’s first admin from setting it up', async () => {
    await ensureSupportAdmin(db, SUPPORT);
    expect(await needsFirstAdmin(db)).toBe(true);
    const r = await setUpSchool(db, { code: 'setup-code-1234', school: 'Masjid Sample', name: 'First Head', email: 'first@example.org', password: PASSWORD });
    expect(r.ok).toBe(true);
    expect(await needsFirstAdmin(db)).toBe(false);
  });
});

describe('signing in for support', () => {
  it('the owner dashboard’s one-time link opens it, and then you’re signed in as Madressa Support', async () => {
    await ensureSupportAdmin(db, SUPPORT);
    const r = await ownerAdminLink(db, { email: 'support@example.org' });
    expect(r.status).toBe(200);
    const token = (r as { link: string }).link.split('/').pop()!;
    const redeemed = await redeemPasswordLink(db, 'admin', token, 'a fresh support password');
    expect(redeemed.ok).toBe(true);
    const s = await validateSession(db, 'admin', redeemed.ok ? redeemed.token : '');
    expect(s?.identity.email).toBe('support@example.org');
    expect((await login(db, 'admin', 'support@example.org', 'a fresh support password')).ok).toBe(true);
  });
});
