import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminStaff } from '@/db/schema';
import { cookieName, type Portal, validateSession } from '@/server/auth';
import { adminCan, type AdminPerm } from '@/server/permissions';

const sessionFor = cache(async (portal: Portal) => {
  const token = (await cookies()).get(cookieName(portal))?.value;
  return validateSession(db, portal, token);
});

export const getAdmin = cache(async () => {
  const s = await sessionFor('admin');
  if (!s?.identity.adminStaffId) return null;
  const [staff] = await db.select().from(adminStaff).where(eq(adminStaff.id, s.identity.adminStaffId)).limit(1);
  if (!staff || staff.deletedAt) return null;
  return { identityId: s.identity.id, name: staff.name, email: staff.email, staff };
});
export type AdminActor = NonNullable<Awaited<ReturnType<typeof getAdmin>>>;

/** Every admin page and server action calls this first. Hiding a button is never the check. */
export async function requireAdmin(perm: AdminPerm = 'view'): Promise<AdminActor> {
  const a = await getAdmin();
  if (!a) redirect('/admin/login');
  if (!adminCan(a.staff, perm)) redirect('/admin/no-access');
  return a;
}

/** The audit actor for server actions. */
export const actorOf = (a: AdminActor) => ({ identityId: a.identityId, name: a.name });

export async function requestMeta() {
  const h = await headers();
  // Forwarded headers are client-controlled unless a proxy we run sets them.
  const ip = process.env.TRUST_PROXY === '1' ? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null : null;
  return { ip, userAgent: h.get('user-agent') };
}

export { sessionFor };
