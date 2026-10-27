import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { adminStaff, loginIdentity } from '@/db/schema';
import { audit } from '../audit';
import { makePasswordLink } from '../password-links';

/*
 * POST /api/owner/set-password-link on a madrasah copy: the owner dashboard's "Copy a set-password link" for one of this
 * madrasah's admins (a locked-out head teacher). Made here, so this madrasah's own audit log records it.
 */
export async function ownerAdminLink(db: DbOrTx, raw: unknown): Promise<{ status: 200; link: string } | { status: 404 | 422; error: string }> {
  const email = typeof raw === 'object' && raw && typeof (raw as { email?: unknown }).email === 'string' ? (raw as { email: string }).email.trim().toLowerCase().slice(0, 200) : '';
  if (!email) return { status: 422, error: 'Say which admin.' };
  const [row] = await db.select({ staff: adminStaff, idn: loginIdentity }).from(adminStaff).innerJoin(loginIdentity, eq(loginIdentity.adminStaffId, adminStaff.id))
    .where(and(isNull(adminStaff.deletedAt), eq(sql`lower(${adminStaff.email})`, email))).limit(1);
  if (!row) return { status: 404, error: 'No admin with that email here.' };
  if (!row.idn.allowLogin) return { status: 422, error: 'This admin isn’t allowed to sign in. Change that in the madrasah’s own admin first.' };
  const link = (await makePasswordLink(db, row.idn))!;
  await audit(db, { identityId: null, name: 'Owner (owner dashboard)' }, { action: `Made a set-password link for ${row.staff.email}`, page: 'Owner dashboard', entity: 'login_identity', entityId: row.idn.id });
  return { status: 200, link };
}
