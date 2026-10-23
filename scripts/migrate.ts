import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.argv[2] === '--test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) throw new Error('Database URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
await sql.end();
console.log('Migrations applied');
