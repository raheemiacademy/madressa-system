import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { authToken, contact, loginIdentity, teacher } from '@/db/schema';
import { audit } from './audit';
import { createSession, hashPassword, hitRateLimit, invalidateAllSessions, passwordProblem, sha256, type Portal } from './auth';
import { enqueueMail } from './comm/mail';
import { render } from './comm/templates';
import { log } from './ops/logs';

/** Portals whose people get emailed links to set their own password (question 14). */
export const LINK_PORTALS = ['teacher', 'parent'] as const;
export type LinkPortal = (typeof LINK_PORTALS)[number];
export const isLinkPortal = (p: string): p is LinkPortal => (LINK_PORTALS as readonly string[]).includes(p);
const LINK_HOURS = 48;
const PORTAL_NAME: Record<LinkPortal, string> = { teacher: 'teacher portal', parent: 'parent portal' };
/** How a teacher's or parent's portal login stands, for their profile page. */
export function describeLogin(l: { email: string; passwordHash: string | null; allowLogin: boolean; emailVerifiedAt: Date | null; mustChangePassword: boolean; lastLoginAt: Date | null } | null, lastSeen: (d: Date) => string) {
  if (!l) return 'No login (add an email)';
  if (!l.allowLogin) return `${l.email}: blocked`;
  if (!l.passwordHash) return `${l.email}: invited, no password yet`;
  const state = l.mustChangePassword ? 'password set by the school, to be changed at next sign-in' : l.emailVerifiedAt ? 'email confirmed' : 'email not confirmed yet';
  return `${l.email}: ${state}${l.lastLoginAt ? `, last signed in ${lastSeen(l.lastLoginAt)}` : ', never signed in'}`;
}

export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function personName(db: DbOrTx, idn: typeof loginIdentity.$inferSelect) {
  if (idn.teacherId) return (await db.select({ n: teacher.name }).from(teacher).where(eq(teacher.id, idn.teacherId)).limit(1))[0]?.n ?? '';
  if (idn.contactId) return (await db.select({ n: contact.name }).from(contact).where(eq(contact.id, idn.contactId)).limit(1))[0]?.n ?? '';
  return '';
}

/** A one-time link that verifies the address and sets a password. Older unused links stop working. */
export async function makePasswordLink(db: DbOrTx, idn: typeof loginIdentity.$inferSelect) {
  if (!isLinkPortal(idn.portal)) return null;
  const raw = randomBytes(32).toString('base64url');
  await db.update(authToken).set({ usedAt: new Date() }).where(and(eq(authToken.identityId, idn.id), isNull(authToken.usedAt)));
  await db.insert(authToken).values({ identityId: idn.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000) });
  return `${appUrl()}/${idn.portal}/set-password/${raw}`;
}

/** Emails the person a set-password link. */
export async function sendPasswordLink(db: DbOrTx, idn: typeof loginIdentity.$inferSelect, createdBy: number | null = null) {
  if (!isLinkPortal(idn.portal)) return false;
  const link = (await makePasswordLink(db, idn))!;
  const mail = await render(db, 'portals.set-password', { NAME: await personName(db, idn), PORTAL: PORTAL_NAME[idn.portal], LINK: link, HOURS: String(LINK_HOURS) });
  await enqueueMail(db, [{ to: idn.email, subject: mail.subject, html: mail.html, entity: 'login_identity', entityId: idn.id, createdBy }]);
  await log(db, idn.portal === 'teacher' ? 'teacher' : 'contact', 'Emailed a set-password link', idn.id);
  return true;
}

/** "Forgot password" / first sign-in: always the same answer, so it doesn't reveal who has an account. */
export async function requestPasswordLink(db: Db, portal: Portal, emailRaw: string) {
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  if (!isLinkPortal(portal) || !email) return;
  if (!(await hitRateLimit(db, `pwlink:${portal}:${email}`, { hits: 3, windowMs: 60 * 60_000 }))) return;
  const [idn] = await db.select().from(loginIdentity).where(and(eq(loginIdentity.portal, portal), eq(sql`lower(${loginIdentity.email})`, email))).limit(1);
  if (idn?.allowLogin) await sendPasswordLink(db, idn);
}

const findToken = async (db: DbOrTx, portal: Portal, raw: string) => {
  if (!raw || raw.length > 100) return null;
  const [row] = await db.select({ t: authToken, i: loginIdentity }).from(authToken).innerJoin(loginIdentity, eq(loginIdentity.id, authToken.identityId))
    .where(and(eq(authToken.tokenHash, sha256(raw)), isNull(authToken.usedAt), gt(authToken.expiresAt, new Date()), eq(loginIdentity.portal, portal))).limit(1);
  return row && row.i.allowLogin ? row : null;
};
export const linkIsValid = async (db: DbOrTx, portal: Portal, raw: string) => !!(await findToken(db, portal, raw));

/** Uses a link: sets the password, marks the email verified, signs out elsewhere and signs in here. */
export async function redeemPasswordLink(db: Db, portal: Portal, raw: string, password: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const problem = passwordProblem(password);
  if (problem) return { ok: false as const, error: problem };
  return db.transaction(async (tx) => {
    const row = await findToken(tx, portal, raw);
    if (!row) return { ok: false as const, error: 'This link has expired or has already been used. Ask for a new one.' };
    await tx.update(authToken).set({ usedAt: new Date() }).where(eq(authToken.id, row.t.id));
    await tx.update(loginIdentity).set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), mustChangePassword: false, failedAttempts: 0, lockedUntil: null }).where(eq(loginIdentity.id, row.i.id));
    await invalidateAllSessions(tx, row.i.id);
    await audit(tx, { identityId: row.i.id, name: row.i.email }, { action: `Set a ${portal} portal password from an email link`, page: 'Sign in', entity: 'login_identity', entityId: row.i.id });
    return { ok: true as const, ...(await createSession(tx, row.i.id, portal, meta)) };
  });
}

/** The forced change after signing in with a password an admin chose. */
export async function changeOwnPassword(db: Db, identityId: number, password: string, confirm: string) {
  if (password !== confirm) return { ok: false as const, error: 'The two passwords don’t match.' };
  const problem = passwordProblem(password);
  if (problem) return { ok: false as const, error: problem };
  await db.update(loginIdentity).set({ passwordHash: await hashPassword(password), mustChangePassword: false }).where(eq(loginIdentity.id, identityId));
  await audit(db, { identityId, name: 'Portal user' }, { action: 'Changed their portal password after an admin set it', page: 'Sign in', entity: 'login_identity', entityId: identityId });
  return { ok: true as const };
}
