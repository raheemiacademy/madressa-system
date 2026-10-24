import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { loginIdentity } from '@/db/schema';
import { hashPassword, invalidateAllSessions, passwordProblem } from '../auth';

type PersonPortal = 'teacher' | 'parent' | 'student';
const column = { teacher: loginIdentity.teacherId, parent: loginIdentity.contactId, student: loginIdentity.studentId } as const;
const key = { teacher: 'teacherId', parent: 'contactId', student: 'studentId' } as const;

export const loginFor = async (db: DbOrTx, portal: PersonPortal, personId: number) =>
  (await db.select().from(loginIdentity).where(eq(column[portal], personId)).limit(1))[0] ?? null;

/**
 * Keeps a person's portal login in step with their record.
 * email null → login removed. password '' → unchanged. Returns an error message for the password or email field.
 */
export async function syncPortalLogin(
  db: DbOrTx, portal: PersonPortal, personId: number, email: string | null, password: string, allowLogin = true
): Promise<{ field: 'email' | 'password'; error: string } | null> {
  const existing = await loginFor(db, portal, personId);
  if (!email) {
    if (existing) await db.delete(loginIdentity).where(eq(loginIdentity.id, existing.id));
    return password ? { field: 'email', error: 'Add an email address to give this person a portal password.' } : null;
  }
  const clash = await db.select({ id: loginIdentity.id }).from(loginIdentity)
    .where(and(eq(loginIdentity.portal, portal), sql`lower(${loginIdentity.email}) = ${email.toLowerCase()}`, existing ? ne(loginIdentity.id, existing.id) : sql`true`)).limit(1);
  if (clash[0]) return { field: 'email', error: 'Another person already uses this email to sign in to this portal.' };
  if (password) {
    const p = passwordProblem(password);
    if (p) return { field: 'password', error: p };
  }
  const passwordHash = password ? await hashPassword(password) : undefined;
  if (existing) {
    // An admin-chosen password must be changed by its owner after signing in (question 14); a new email needs verifying again.
    const emailChanged = existing.email.toLowerCase() !== email.toLowerCase();
    await db.update(loginIdentity).set({ email, allowLogin, ...(emailChanged ? { emailVerifiedAt: null } : {}), ...(passwordHash ? { passwordHash, failedAttempts: 0, lockedUntil: null, mustChangePassword: true } : {}) }).where(eq(loginIdentity.id, existing.id));
    if (passwordHash || !allowLogin || emailChanged) await invalidateAllSessions(db, existing.id);
  } else {
    await db.insert(loginIdentity).values({ portal, email, allowLogin, passwordHash: passwordHash ?? null, mustChangePassword: !!passwordHash, [key[portal]]: personId });
  }
  return null;
}
