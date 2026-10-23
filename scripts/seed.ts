// Fictional seed data for local development and e2e tests. Never put real people here.
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/server/auth';

const url = process.argv.includes('--test') ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!url) throw new Error('Database URL is not set');
if (!password || password.length < 10) throw new Error('Set SEED_ADMIN_PASSWORD (10+ characters) to seed the sample admin logins');

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const { adminStaff, loginIdentity, schoolProfile, academicYear, holiday } = schema;
const hash = await hashPassword(password);

await db.insert(schoolProfile).values({ id: 1, name: 'Sample Academy', city: 'Testville', postcode: 'ZZ1 1ZZ', email: 'office@example.org', noReplyEmail: 'no-reply@example.org' }).onConflictDoNothing();

async function staff(name: string, email: string, flags: Partial<typeof adminStaff.$inferInsert>) {
  let [s] = await db.select().from(adminStaff).where(eq(adminStaff.email, email));
  if (!s) [s] = await db.insert(adminStaff).values({ name, email, rank: 'Administrator', ...flags }).returning();
  const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, s!.id));
  if (idn) await db.update(loginIdentity).set({ passwordHash: hash, allowLogin: true, failedAttempts: 0, lockedUntil: null }).where(eq(loginIdentity.id, idn.id));
  else await db.insert(loginIdentity).values({ portal: 'admin', email, passwordHash: hash, adminStaffId: s!.id });
}
await staff('Sample Admin One', 'admin@example.org', { isSuper: true, rank: 'Head Administrator' });
await staff('Sample Clerk Two', 'clerk@example.org', { canEdit: true, rank: 'Secretary' });

const [cur] = await db.select().from(academicYear).where(eq(academicYear.title, '2026/27'));
if (!cur) {
  await db.insert(academicYear).values({ title: '2025/26', startsOn: '2025-09-01', endsOn: '2026-07-31' });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  await db.insert(holiday).values([
    { academicYearId: y!.id, title: 'Half term', startsOn: '2026-10-26', endsOn: '2026-10-30' },
    { academicYearId: y!.id, title: 'Winter break', startsOn: '2026-12-21', endsOn: '2027-01-01', description: 'Classes restart on Monday 4 January.' }
  ]);
}
await client.end();
console.log('Seeded fictional sample data: admin@example.org (super) and clerk@example.org (can edit)');
