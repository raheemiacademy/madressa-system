import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { authToken, loginIdentity, ownerTotp, session } from '@/db/schema';
import { audit } from '../audit';
import { createSession, dummy, hashPassword, hitRateLimit, invalidateAllSessions, LOCKOUT_MS, MAX_FAILED_ATTEMPTS, sha256, verifyPassword } from '../auth';
import { decrypt, encrypt } from '../crypto';
import { appUrl } from '../password-links';
import { groupKey, matchStep, newSecret, otpauthUrl } from './totp';

/*
 * The owner dashboard's one sign-in (OWNER-DASHBOARD.md): password plus an authenticator code, on the main site only.
 * The account is made, and remade if the phone is lost, by `./madrasah owner` on the server; there is no sign-up.
 */
export const ownerEnabled = () => process.env.MARKETING_SITE === '1';
export const OWNER_MIN_PASSWORD = 12;
const SIGN_IN_LIMIT = { hits: 10, windowMs: 15 * 60_000 };
const SETUP_HOURS = 24;
const PAGE = 'Owner';
const actor = (identityId: number) => ({ identityId, name: 'Owner' });

type Meta = { ip?: string | null; userAgent?: string | null };
export type Errors = Partial<Record<'email' | 'password' | 'code' | 'current' | 'next' | 'repeat' | 'confirm', string>>;

const BAD = 'Email or password is incorrect.';
const SLOW = 'Too many attempts. Wait 15 minutes, then try again.';
const CODE_BAD = 'That code didn’t work. Type the newest code from your authenticator app.';
const CODE_FORMAT = 'Enter the 6 digits from your authenticator app.';
const pwTooShort = (pw: string) => pw.length < OWNER_MIN_PASSWORD ? `Use at least ${OWNER_MIN_PASSWORD} characters for the new password.` : pw.length > 200 ? 'Use 200 characters or fewer.' : null;

const findOwner = async (db: DbOrTx) => (await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'owner')).limit(1))[0] ?? null;
const totpOf = async (db: DbOrTx, identityId: number) => (await db.select().from(ownerTotp).where(eq(ownerTotp.identityId, identityId)).limit(1))[0] ?? null;

export type SignInResult = { ok: true; token?: string; expiresAt?: Date } | { ok: false; error: string; field?: 'password' | 'code' };

/**
 * Both sign-in screens. Without a code it only checks the password (the first screen); with one it checks both again and
 * signs in. Wrong passwords and wrong codes count towards the same lockout, and every attempt counts towards the rate limit.
 */
export async function ownerSignIn(db: Db, emailRaw: string, password: string, code: string | null, meta: Meta = {}, now = new Date()): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: 'Enter your email and password.', field: 'password' };
  if (code !== null && !/^\d{6}$/.test(code)) return { ok: false, error: CODE_FORMAT, field: 'code' };
  // Without a trusted client IP every attempt shares one key: the owner may wait out a lockout, but nobody gets many guesses.
  if (!(await hitRateLimit(db, `owner-login:${meta.ip ?? 'unknown'}`, SIGN_IN_LIMIT, now))) return { ok: false, error: SLOW };

  const idn = await findOwner(db);
  if (!idn || !idn.passwordHash || idn.email.toLowerCase() !== email) {
    await verifyPassword(await dummy(), password);
    return { ok: false, error: BAD, field: 'password' };
  }
  if (idn.lockedUntil && idn.lockedUntil > now) return { ok: false, error: SLOW };
  const fail = async (what: string, error: string, field: 'password' | 'code') => {
    const failed = idn.failedAttempts + 1;
    await db.update(loginIdentity).set(failed >= MAX_FAILED_ATTEMPTS ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) } : { failedAttempts: failed })
      .where(eq(loginIdentity.id, idn.id));
    await audit(db, actor(idn.id), { action: failed >= MAX_FAILED_ATTEMPTS ? `${what}: owner sign-in locked for 15 minutes` : what, page: PAGE, details: meta.ip ? { ip: meta.ip } : undefined });
    return { ok: false as const, error: failed >= MAX_FAILED_ATTEMPTS ? SLOW : error, field };
  };
  if (!(await verifyPassword(idn.passwordHash, password))) return fail('Wrong owner password', BAD, 'password');
  if (code === null) return { ok: true };

  const t = await totpOf(db, idn.id);
  const step = t?.secret ? matchStep(decrypt(t.secret), code, now, t.lastStep) : null;
  if (step === null) return fail('Wrong authenticator code', CODE_BAD, 'code');
  await db.update(ownerTotp).set({ lastStep: step, updatedAt: now }).where(eq(ownerTotp.identityId, idn.id));
  await db.update(loginIdentity).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now }).where(eq(loginIdentity.id, idn.id));
  const s = await createSession(db, idn.id, 'owner', meta);
  await audit(db, actor(idn.id), { action: 'Signed in to the owner dashboard', page: PAGE, details: meta.ip ? { ip: meta.ip } : undefined });
  return { ok: true, ...s };
}

/**
 * `./madrasah owner <email>`: makes the owner account, or resets the existing one (new email, no password, new authenticator
 * key, every device signed out), and returns a one-time setup link valid for 24 hours.
 */
export async function makeOwnerSetupLink(db: Db, emailRaw: string, now = new Date()) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error('Give the owner’s email address');
  const raw = randomBytes(32).toString('base64url');
  await db.transaction(async (tx) => {
    const existing = await findOwner(tx);
    const reset = { email, passwordHash: null, failedAttempts: 0, lockedUntil: null, allowLogin: true };
    const id = existing
      ? (await tx.update(loginIdentity).set(reset).where(eq(loginIdentity.id, existing.id)).returning({ id: loginIdentity.id }))[0]!.id
      : (await tx.insert(loginIdentity).values({ portal: 'owner', ...reset }).returning({ id: loginIdentity.id }))[0]!.id;
    await invalidateAllSessions(tx, id);
    const totp = { secret: null, pendingSecret: encrypt(newSecret()), lastStep: null, updatedAt: now };
    await tx.insert(ownerTotp).values({ identityId: id, ...totp }).onConflictDoUpdate({ target: ownerTotp.identityId, set: totp });
    await tx.update(authToken).set({ usedAt: now }).where(and(eq(authToken.identityId, id), isNull(authToken.usedAt)));
    await tx.insert(authToken).values({ identityId: id, tokenHash: sha256(raw), expiresAt: new Date(now.getTime() + SETUP_HOURS * 3_600_000) });
    await audit(tx, actor(id), { action: existing ? 'Owner account reset from the server: new setup link' : 'Owner account made from the server: setup link', page: PAGE, details: { email } });
  });
  return `${appUrl()}/owner/setup/${raw}`;
}

const findSetup = async (db: DbOrTx, raw: string, now = new Date()) => {
  if (!raw || raw.length > 100) return null;
  const [row] = await db.select({ tokenId: authToken.id, idn: loginIdentity, pending: ownerTotp.pendingSecret }).from(authToken)
    .innerJoin(loginIdentity, eq(loginIdentity.id, authToken.identityId)).innerJoin(ownerTotp, eq(ownerTotp.identityId, loginIdentity.id))
    .where(and(eq(authToken.tokenHash, sha256(raw)), isNull(authToken.usedAt), gt(authToken.expiresAt, now), eq(loginIdentity.portal, 'owner'))).limit(1);
  return row?.pending ? { ...row, pending: decrypt(row.pending) } : null;
};

const keyView = (secret: string, email: string) => ({ key: groupKey(secret), url: otpauthUrl(secret, email) });

/** What the setup page shows: the email and the authenticator key to add. Null once used or expired. */
export async function ownerSetupView(db: DbOrTx, raw: string) {
  const s = await findSetup(db, raw);
  return s ? { email: s.idn.email, ...keyView(s.pending, s.idn.email) } : null;
}

export type SetupResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error?: string; errors?: Errors };

/** The setup page: choose the password, prove the authenticator works with one code, and sign in. */
export async function completeOwnerSetup(db: Db, raw: string, f: { password: string; confirm: string; code: string }, meta: Meta = {}, now = new Date()): Promise<SetupResult> {
  const errors: Errors = {};
  const short = pwTooShort(f.password);
  if (short) errors.password = short.replace(' new', '');
  else if (f.password !== f.confirm) errors.confirm = 'The two passwords don’t match.';
  if (!/^\d{6}$/.test(f.code)) errors.code = CODE_FORMAT;
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!(await hitRateLimit(db, `owner-setup:${meta.ip ?? 'unknown'}`, SIGN_IN_LIMIT, now))) return { ok: false, error: SLOW };
  return db.transaction(async (tx) => {
    const s = await findSetup(tx, raw, now);
    if (!s) return { ok: false as const, error: 'This setup link has expired or has already been used. Run ./madrasah owner on the server for a new one.' };
    const step = matchStep(s.pending, f.code, now, null);
    if (step === null) return { ok: false as const, errors: { code: CODE_BAD } };
    await tx.update(authToken).set({ usedAt: now }).where(eq(authToken.id, s.tokenId));
    await tx.update(loginIdentity).set({ passwordHash: await hashPassword(f.password), emailVerifiedAt: now, lastLoginAt: now, failedAttempts: 0, lockedUntil: null }).where(eq(loginIdentity.id, s.idn.id));
    await tx.update(ownerTotp).set({ secret: encrypt(s.pending), pendingSecret: null, lastStep: step, updatedAt: now }).where(eq(ownerTotp.identityId, s.idn.id));
    await audit(tx, actor(s.idn.id), { action: 'Owner setup finished: password and authenticator set', page: PAGE, details: meta.ip ? { ip: meta.ip } : undefined });
    return { ok: true as const, ...(await createSession(tx, s.idn.id, 'owner', meta)) };
  });
}

/** Account → Change password. Signs out every other device; this one stays signed in. */
export async function changeOwnerPassword(db: Db, identityId: number, currentToken: string, f: { current: string; next: string; repeat: string }): Promise<{ ok: true } | { ok: false; errors: Errors; error?: string }> {
  if (!f.current) return { ok: false, errors: { current: 'Enter your current password.' } };
  const short = pwTooShort(f.next);
  if (short) return { ok: false, errors: { next: short } };
  if (f.next !== f.repeat) return { ok: false, errors: { repeat: 'The two new passwords don’t match.' } };
  if (!(await hitRateLimit(db, `owner-password:${identityId}`, SIGN_IN_LIMIT))) return { ok: false, errors: {}, error: SLOW };
  const [idn] = await db.select().from(loginIdentity).where(and(eq(loginIdentity.id, identityId), eq(loginIdentity.portal, 'owner'))).limit(1);
  if (!idn?.passwordHash || !(await verifyPassword(idn.passwordHash, f.current))) {
    await audit(db, actor(identityId), { action: 'Wrong current password when changing the owner password', page: PAGE });
    return { ok: false, errors: { current: 'Your current password is incorrect.' } };
  }
  await db.transaction(async (tx) => {
    await tx.update(loginIdentity).set({ passwordHash: await hashPassword(f.next) }).where(eq(loginIdentity.id, identityId));
    await tx.delete(session).where(and(eq(session.identityId, identityId), ne(session.id, sha256(currentToken))));
    await audit(tx, actor(identityId), { action: 'Changed the owner password; other devices signed out', page: PAGE });
  });
  return { ok: true };
}

/** Account → Reset the authenticator, first half: a new key to add. The old one keeps working until a code from the new one is accepted. */
export async function startAuthenticatorReset(db: Db, identityId: number, email: string) {
  const secret = newSecret();
  await db.update(ownerTotp).set({ pendingSecret: encrypt(secret), updatedAt: new Date() }).where(eq(ownerTotp.identityId, identityId));
  await audit(db, actor(identityId), { action: 'Started resetting the owner authenticator', page: PAGE });
  return keyView(secret, email);
}

/** Second half: one code from the new key switches to it. */
export async function confirmAuthenticatorReset(db: Db, identityId: number, code: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: CODE_FORMAT };
  if (!(await hitRateLimit(db, `owner-totp:${identityId}`, SIGN_IN_LIMIT, now))) return { ok: false, error: SLOW };
  const t = await totpOf(db, identityId);
  const step = t?.pendingSecret ? matchStep(decrypt(t.pendingSecret), code, now, null) : null;
  if (step === null) return { ok: false, error: t?.pendingSecret ? CODE_BAD : 'Start the reset again.' };
  await db.update(ownerTotp).set({ secret: t!.pendingSecret, pendingSecret: null, lastStep: step, updatedAt: now }).where(eq(ownerTotp.identityId, identityId));
  await audit(db, actor(identityId), { action: 'Reset the owner authenticator', page: PAGE });
  return { ok: true };
}

export async function signOutEverywhere(db: Db, identityId: number) {
  await invalidateAllSessions(db, identityId);
  await audit(db, actor(identityId), { action: 'Signed out of the owner dashboard everywhere', page: PAGE });
}

/** Account → Where you’re signed in, newest first. */
export async function ownerSessions(db: DbOrTx, identityId: number, currentToken: string) {
  const here = sha256(currentToken);
  const rows = await db.select({ id: session.id, userAgent: session.userAgent, ip: session.ip, lastSeenAt: session.lastSeenAt, createdAt: session.createdAt }).from(session)
    .where(and(eq(session.identityId, identityId), eq(session.portal, 'owner'), gt(session.expiresAt, sql`now()`))).orderBy(desc(session.lastSeenAt));
  return rows.map(({ id, ...r }) => ({ ...r, current: id === here }));
}

/** Pages call this on every view; "last seen" moves at most every 5 minutes. */
export async function touchOwnerSession(db: DbOrTx, token: string, now = new Date()) {
  await db.update(session).set({ lastSeenAt: now })
    .where(and(eq(session.id, sha256(token)), lt(session.lastSeenAt, new Date(now.getTime() - 5 * 60_000))));
}
