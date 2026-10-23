import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url || !/\/school_test(\?|$)/.test(url)) throw new Error('DATABASE_URL_TEST must point at the school_test database');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();
}
