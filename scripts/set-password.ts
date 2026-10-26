// Gives sign-ins a new random password and prints "portal email password" lines (./madrasah password on the server keeps them).
//   tsx scripts/set-password.ts <email>   one person (every portal they sign in to)
//   tsx scripts/set-password.ts --all     every sign-in that has a password
import { randomInt } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, isNotNull, sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/server/auth';
import { log } from '../src/server/ops/logs';

const who = process.argv[2]?.trim().toLowerCase();
if (!who) throw new Error('Name an email, or --all');
const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const { loginIdentity, session } = schema;

// Three groups of four from letters and digits that can't be misread (no 0/o, 1/l/i): about 59 bits.
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const newPassword = () => [0, 1, 2].map(() => Array.from({ length: 4 }, () => ABC[randomInt(ABC.length)]).join('')).join('-');

const rows = await db.select().from(loginIdentity).where(who === '--all' ? isNotNull(loginIdentity.passwordHash) : eq(sql`lower(${loginIdentity.email})`, who));
for (const r of rows) {
  const pw = newPassword();
  await db.update(loginIdentity).set({ passwordHash: await hashPassword(pw), failedAttempts: 0, lockedUntil: null, mustChangePassword: false }).where(eq(loginIdentity.id, r.id));
  await db.delete(session).where(eq(session.identityId, r.id)); // devices signed in with the old password are signed out
  await log(db, 'system', `New password set from the server for ${r.email} (${r.portal})`);
  console.log(`${r.portal} ${r.email} ${pw}`);
}
await client.end();
if (!rows.length) { console.error(`No sign-in found for ${who}`); process.exit(1); }
