// Makes the owner-dashboard account, or resets it if the phone or password is lost, and prints a one-time setup link (24 hours).
//   tsx scripts/owner-setup.ts <email>          (./madrasah owner <email> on the server runs this in the main site's copy)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { makeOwnerSetupLink, ownerEnabled } from '../src/server/owner/auth';

const email = process.argv[2] ?? '';
if (!ownerEnabled()) { console.error('This copy is not the main site (MARKETING_SITE=1), so it has no owner dashboard.'); process.exit(1); }
const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
try {
  const link = await makeOwnerSetupLink(drizzle(client, { schema }), email);
  console.log(link);
} catch (e) {
  console.error((e as Error).message); process.exitCode = 1;
} finally { await client.end(); }
