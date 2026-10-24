import { db, sql } from '@/db';
import { adminStaff, loginIdentity } from '@/db/schema';
import { hashPassword } from '@/server/auth';

export { db };

export async function resetDb() {
  if (!/school_test/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to reset a non-test database');
  const rows = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename not in ('__drizzle_migrations', 'attendance_code')`;
  if (rows.length) await sql.unsafe(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`);
}

export const PASSWORD = 'correct horse battery';
let cachedHash: string | undefined;

export async function makeStaff(over: Partial<typeof adminStaff.$inferInsert> = {}, opts: { allowLogin?: boolean } = {}) {
  cachedHash ??= await hashPassword(PASSWORD);
  const [s] = await db.insert(adminStaff).values({ name: 'Test Admin', email: `admin${Math.random().toString(36).slice(2, 8)}@example.org`, ...over }).returning();
  const [i] = await db.insert(loginIdentity).values({ portal: 'admin', email: s!.email, passwordHash: cachedHash, allowLogin: opts.allowLogin ?? true, adminStaffId: s!.id }).returning();
  return { staff: s!, identity: i!, actor: { identityId: i!.id, name: s!.name, staffId: s!.id } };
}
