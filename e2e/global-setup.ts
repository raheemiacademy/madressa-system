import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

// Fresh, migrated, seeded test database for every e2e run.
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url || !/\/school_test(\?|$)/.test(url)) throw new Error('DATABASE_URL_TEST must point at school_test');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const rows = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename not in ('__drizzle_migrations', 'attendance_code')`;
  if (rows.length) await sql.unsafe(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`);
  await sql.end();
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts', '--test'], { stdio: 'inherit', env: process.env });
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts', '--test'], { stdio: 'inherit', env: process.env });
}
