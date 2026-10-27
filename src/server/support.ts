import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { adminStaff, loginIdentity, setting } from '@/db/schema';
import { SUPPORT_ADMIN } from '@/lib/support';
import { audit } from './audit';
import { invalidateAllSessions } from './auth';

/*
 * Keeps Madressa's remote support account (src/lib/support.ts) in every madrasah: a super admin with no password, made or
 * brought up to date when the madrasah starts. Which staff row it is lives in `setting` (support_admin), so a school renaming
 * things can't lose it.
 */
const TAB = 'support_admin';
const SYSTEM = { identityId: null, name: 'Madressa (automatic)' };

export async function supportStaffId(db: DbOrTx) {
  const [row] = await db.select().from(setting).where(eq(setting.tab, TAB));
  return (row?.value as { staffId?: number } | undefined)?.staffId ?? null;
}

export const isSupportStaff = async (db: DbOrTx, id: number) => (await supportStaffId(db)) === id;

/**
 * Makes the support account, or brings it up to date (name, email, super, allowed to sign in). A new email means a new
 * person: the old password and every signed-in device stop working. Returns what it did.
 */
export async function ensureSupportAdmin(db: Db, cfg: { name: string; email: string } = SUPPORT_ADMIN): Promise<'no email set' | 'added' | 'updated' | 'unchanged'> {
  const email = cfg.email.trim().toLowerCase();
  if (!email) return 'no email set';
  return db.transaction(async (tx) => {
    const id = await supportStaffId(tx);
    let [staff] = id ? await tx.select().from(adminStaff).where(and(eq(adminStaff.id, id), isNull(adminStaff.deletedAt))) : [];
    // Someone already on the staff list with that email (e.g. the owner added themselves) becomes the support account.
    if (!staff) [staff] = await tx.select().from(adminStaff).where(and(eq(sql`lower(${adminStaff.email})`, email), isNull(adminStaff.deletedAt)));
    const want = { name: cfg.name, email, isSuper: true, role: 'Remote support' };
    let outcome: 'added' | 'updated' | 'unchanged' = 'unchanged';
    if (!staff) {
      [staff] = await tx.insert(adminStaff).values(want).returning();
      outcome = 'added';
    } else if (staff.name !== want.name || staff.email.toLowerCase() !== email || !staff.isSuper || staff.role !== want.role) {
      await tx.update(adminStaff).set(want).where(eq(adminStaff.id, staff.id));
      outcome = 'updated';
    }
    const [idn] = await tx.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, staff!.id));
    if (!idn) {
      // A login with no password: only a one-time link from the owner dashboard opens it.
      await tx.insert(loginIdentity).values({ portal: 'admin', email, adminStaffId: staff!.id, allowLogin: true, passwordHash: null });
      if (outcome === 'unchanged') outcome = 'updated';
    } else if (idn.email.toLowerCase() !== email) {
      await tx.update(loginIdentity).set({ email, passwordHash: null, allowLogin: true, failedAttempts: 0, lockedUntil: null }).where(eq(loginIdentity.id, idn.id));
      await invalidateAllSessions(tx, idn.id);
      outcome = 'updated';
    } else if (!idn.allowLogin) {
      await tx.update(loginIdentity).set({ allowLogin: true }).where(eq(loginIdentity.id, idn.id));
      outcome = 'updated';
    }
    if (id !== staff!.id) await tx.insert(setting).values({ tab: TAB, value: { staffId: staff!.id } }).onConflictDoUpdate({ target: setting.tab, set: { value: { staffId: staff!.id }, updatedAt: new Date() } });
    if (outcome !== 'unchanged') await audit(tx, SYSTEM, { action: `${outcome === 'added' ? 'Added' : 'Updated'} Madressa’s remote support account (${email})`, page: 'Admin staff', entity: 'admin_staff', entityId: staff!.id });
    return outcome;
  });
}

/** Worker step: once each time a madrasah's copy starts (never on the main site, which isn't a madrasah). */
let done = false;
export async function supportTick(db: Db) {
  if (done || process.env.MARKETING_SITE === '1') return;
  done = true;
  const r = await ensureSupportAdmin(db);
  if (r !== 'unchanged') console.log(`[worker] support account: ${r}`);
}
