import { db } from '@/db';
import { buildSummary, summaryAccess } from '@/server/owner/summary';

export const dynamic = 'force-dynamic';

/** The owner dashboard asks every madrasah copy for this every 5 minutes, over the server's private network. */
export async function GET(req: Request) {
  const status = summaryAccess(req.headers);
  if (status !== 200) return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
  return Response.json(await buildSummary(db), { headers: { 'cache-control': 'no-store' } });
}
