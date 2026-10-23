import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db';
import { adminStaff, loginIdentity } from '@/db/schema';
import { checkbox, optionalIsoDate, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit, type AuditActor } from './audit';
import { hashPassword, invalidateAllSessions, passwordProblem } from './auth';

export const RANKS = ['Committee', 'Head Teacher', 'Head of Education', 'Administrator', 'Secretary', 'Director', 'Deputy Head', 'Head Administrator', 'Head of Day Alim', 'Head of Hifz', 'Head of Maktab'];

export const staffInput = z.object({
  name: z.string().trim().min(1, 'Add a name').max(120),
  email: z.email('Enter a valid email address').trim().toLowerCase().max(200),
  password: z.string().max(200).default(''),
  phone: optionalText(40), mobile: optionalText(40), rank: optionalText(60), role: optionalText(80),
  allowLogin: checkbox,
  dbsNumber: optionalText(40), dbsIssuedOn: optionalIsoDate, dbsExpiresOn: optionalIsoDate,
  isSuper: checkbox, canEdit: checkbox, canDelete: checkbox, feesAccess: checkbox, marketing: checkbox, sendSms: checkbox
}).refine((v) => !v.dbsIssuedOn || !v.dbsExpiresOn || v.dbsExpiresOn > v.dbsIssuedOn, { path: ['dbsExpiresOn'], message: 'Expiry must be after the issue date' });

export const listStaff = (db: Db) => db.select({ s: adminStaff, allowLogin: loginIdentity.allowLogin, lastLoginAt: loginIdentity.lastLoginAt })
  .from(adminStaff).leftJoin(loginIdentity, eq(loginIdentity.adminStaffId, adminStaff.id))
  .where(isNull(adminStaff.deletedAt)).orderBy(asc(adminStaff.name));

export async function getStaff(db: Db, id: number) {
  const [r] = await db.select({ s: adminStaff, allowLogin: loginIdentity.allowLogin, hasPassword: sql<boolean>`${loginIdentity.passwordHash} is not null` })
    .from(adminStaff).leftJoin(loginIdentity, eq(loginIdentity.adminStaffId, adminStaff.id))
    .where(and(eq(adminStaff.id, id), isNull(adminStaff.deletedAt))).limit(1);
  return r ?? null;
}

type Result = { ok: true; id: number } | { ok: false; errors: FieldErrors };

/** Number of other active super admins who can still sign in. */
async function otherSupers(db: Pick<Db, 'select'>, exceptId: number) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(adminStaff)
    .innerJoin(loginIdentity, eq(loginIdentity.adminStaffId, adminStaff.id))
    .where(and(eq(adminStaff.isSuper, true), isNull(adminStaff.deletedAt), eq(loginIdentity.allowLogin, true), ne(adminStaff.id, exceptId)));
  return r?.n ?? 0;
}

export async function saveStaff(db: Db, actor: AuditActor & { staffId: number }, raw: unknown, id?: number): Promise<Result> {
  const p = staffInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const { password, allowLogin, ...v } = p.data;
  if (password || !id) {
    const problem = passwordProblem(password);
    if (problem && (password || allowLogin)) return { ok: false, errors: { password: id ? problem : `Set a password. ${problem}` } };
  }
  if (id && id === actor.staffId && (!v.isSuper || !allowLogin)) {
    if ((await otherSupers(db, id)) === 0) return { ok: false, errors: { isSuper: 'You are the only super admin. Make someone else super first.' } };
  }

  return db.transaction(async (tx): Promise<Result> => {
    const clash = await tx.select({ id: adminStaff.id }).from(adminStaff)
      .where(and(sql`lower(${adminStaff.email}) = ${v.email}`, isNull(adminStaff.deletedAt), id ? ne(adminStaff.id, id) : sql`true`)).limit(1);
    if (clash[0]) return { ok: false as const, errors: { email: 'Another staff member already uses this email' } };

    const [row] = id
      ? await tx.update(adminStaff).set(v).where(and(eq(adminStaff.id, id), isNull(adminStaff.deletedAt))).returning()
      : await tx.insert(adminStaff).values(v).returning();
    if (!row) return { ok: false as const, errors: { name: 'This staff member no longer exists' } };

    const passwordHash = password ? await hashPassword(password) : undefined;
    const [idn] = await tx.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, row.id)).limit(1);
    if (idn) {
      await tx.update(loginIdentity).set({ email: v.email, allowLogin, ...(passwordHash ? { passwordHash, failedAttempts: 0, lockedUntil: null } : {}) }).where(eq(loginIdentity.id, idn.id));
      if (passwordHash || !allowLogin || idn.email.toLowerCase() !== v.email) await invalidateAllSessions(tx, idn.id);
    } else {
      await tx.insert(loginIdentity).values({ portal: 'admin', email: v.email, allowLogin, passwordHash: passwordHash ?? null, adminStaffId: row.id });
    }
    const levels = (['isSuper', 'canEdit', 'canDelete', 'feesAccess', 'marketing', 'sendSms'] as const).filter((k) => v[k]);
    await audit(tx, actor, {
      action: `${id ? 'Updated' : 'Added'} admin staff ${row.name}`, page: 'Admin staff', entity: 'admin_staff', entityId: row.id,
      details: { accessLevels: levels, allowLogin, passwordChanged: !!passwordHash }
    });
    return { ok: true as const, id: row.id };
  });
}

export async function deleteStaff(db: Db, actor: AuditActor & { staffId: number }, id: number): Promise<{ ok: boolean; error?: string }> {
  if (id === actor.staffId) return { ok: false, error: 'You can’t delete your own account.' };
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(adminStaff).where(and(eq(adminStaff.id, id), isNull(adminStaff.deletedAt))).limit(1);
    if (!s) return { ok: false, error: 'This staff member no longer exists.' };
    if (s.isSuper && (await otherSupers(tx, id)) === 0) return { ok: false, error: 'This is the only super admin.' };
    await tx.update(adminStaff).set({ deletedAt: new Date() }).where(eq(adminStaff.id, id));
    await tx.delete(loginIdentity).where(eq(loginIdentity.adminStaffId, id)); // cascades to sessions
    await audit(tx, actor, { action: `Deleted admin staff ${s.name}`, page: 'Admin staff', entity: 'admin_staff', entityId: id });
    return { ok: true };
  });
}
