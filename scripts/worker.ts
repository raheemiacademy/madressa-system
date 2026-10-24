// Background worker: sends the mail and SMS queues and runs the daily jobs. Start with `npm run worker`.
import { db, sql } from '../src/db';
import { tick } from '../src/server/comm/jobs';

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; });
console.log('[worker] started');
while (!stopping) {
  await tick(db);
  await new Promise((r) => setTimeout(r, 15_000));
}
await sql.end();
console.log('[worker] stopped');
