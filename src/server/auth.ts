import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, sql as dsql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { loginIdentity, rateLimit, session } from '@/db/schema';

export type Portal = 'admin' | 'teacher' | 'parent' | 'student';
export const PORTALS: readonly Portal[] = ['admin', 'teacher', 'parent', 'student'];

const HOUR = 3_600_000;
// Staff portals hold the most data per login, so their sessions are short; families stay signed in on phones.
export const SESSION_TTL_MS: Record<Portal, number> = { admin: 12 * HOUR, teacher: 12 * HOUR, parent: 30 * 24 * HOUR, student: 30 * 24 * HOUR };
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;
export const IP_LIMIT = { hits: 30, windowMs: 15 * 60_000 };

export const cookieName = (portal: Portal) => `sid_${portal}`;
export const cookiePath = (portal: Portal) => `/${portal}`;

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const; // OWASP argon2id baseline
export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (stored: string, pw: string) => verify(stored, pw).catch(() => false);
// Compared against when no account matches, so a missing account takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;
const dummy = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

export const MIN_PASSWORD_LENGTH = 10;
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 200) return 'Use 200 characters or fewer.';
  return null;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(db: DbOrTx, identityId: number, portal: Portal, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS[portal]);
  await db.insert(session).values({ id: sha256(token), identityId, portal, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

/** Returns the identity for a valid, unexpired session on this portal; slides expiry once half the lifetime has passed. */
export async function validateSession(db: DbOrTx, portal: Portal, token: string | undefined, now = new Date()) {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const [row] = await db.select({ s: session, i: loginIdentity }).from(session)
    .innerJoin(loginIdentity, eq(session.identityId, loginIdentity.id))
    .where(and(eq(session.id, id), eq(session.portal, portal))).limit(1);
  if (!row) return null;
  if (row.s.expiresAt <= now || !row.i.allowLogin || row.i.portal !== portal) {
    await db.delete(session).where(eq(session.id, id));
    return null;
  }
  let expiresAt = row.s.expiresAt;
  if (expiresAt.getTime() - now.getTime() < SESSION_TTL_MS[portal] / 2) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS[portal]);
    await db.update(session).set({ expiresAt, lastSeenAt: now }).where(eq(session.id, id));
  }
  return { identity: row.i, expiresAt, refreshed: expiresAt !== row.s.expiresAt };
}

export async function invalidateSession(db: DbOrTx, token: string | undefined) {
  if (token) await db.delete(session).where(eq(session.id, sha256(token)));
}

export const invalidateAllSessions = (db: DbOrTx, identityId: number) => db.delete(session).where(eq(session.identityId, identityId));

/** Fixed-window counter. Returns false once the key is over its limit. */
export async function hitRateLimit(db: DbOrTx, key: string, limit = IP_LIMIT, now = new Date()) {
  // Raw values inside sql`` aren't type-mapped, so pass timestamps as ISO text cast in SQL.
  const windowStart = dsql`${new Date(now.getTime() - limit.windowMs).toISOString()}::timestamptz`;
  const nowSql = dsql`${now.toISOString()}::timestamptz`;
  const [row] = await db.insert(rateLimit).values({ key, hits: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        hits: dsql`case when ${rateLimit.windowStartedAt} < ${windowStart} then 1 else ${rateLimit.hits} + 1 end`,
        windowStartedAt: dsql`case when ${rateLimit.windowStartedAt} < ${windowStart} then ${nowSql} else ${rateLimit.windowStartedAt} end`
      }
    }).returning({ hits: rateLimit.hits });
  return (row?.hits ?? 0) <= limit.hits;
}

export type LoginResult = { ok: true; token: string; expiresAt: Date; identityId: number } | { ok: false; error: string };
const BAD = 'Email or password is incorrect.';
const SLOW = 'Too many attempts. Wait 15 minutes, then try again.';

export async function login(db: DbOrTx, portal: Portal, emailRaw: string, password: string, meta: { ip?: string | null; userAgent?: string | null } = {}, now = new Date()): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: BAD };
  // Without a trusted client IP, throttle per email so one attacker can't lock everyone out.
  const key = meta.ip ? `login-ip:${meta.ip}` : `login-email:${portal}:${email}`;
  if (!(await hitRateLimit(db, key, IP_LIMIT, now))) return { ok: false, error: SLOW };

  const [idn] = await db.select().from(loginIdentity)
    .where(and(eq(loginIdentity.portal, portal), eq(dsql`lower(${loginIdentity.email})`, email))).limit(1);
  if (!idn || !idn.passwordHash) { await verifyPassword(await dummy(), password); return { ok: false, error: BAD }; }
  if (idn.lockedUntil && idn.lockedUntil > now) return { ok: false, error: SLOW };

  const good = await verifyPassword(idn.passwordHash, password);
  if (!good) {
    const failed = idn.failedAttempts + 1;
    await db.update(loginIdentity).set(failed >= MAX_FAILED_ATTEMPTS
      ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) }
      : { failedAttempts: failed }).where(eq(loginIdentity.id, idn.id));
    return { ok: false, error: BAD };
  }
  if (!idn.allowLogin) return { ok: false, error: 'This account is not allowed to sign in. Ask the school office.' };

  await db.update(loginIdentity).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now }).where(eq(loginIdentity.id, idn.id));
  const s = await createSession(db, idn.id, portal, meta);
  return { ok: true, ...s, identityId: idn.id };
}
