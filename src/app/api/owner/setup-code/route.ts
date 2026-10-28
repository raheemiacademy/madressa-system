import { db } from '@/db';
import { setupCodeAnswer } from '@/server/owner/manage';
import { summaryAccess } from '@/server/owner/summary';

export const dynamic = 'force-dynamic';

/** The owner dashboard asks a new madrasah's copy for its setup code: same private network and token as the summary. */
export async function GET(req: Request) {
  const status = summaryAccess(req.headers);
  const headers = { 'cache-control': 'no-store' };
  if (status !== 200) return new Response(null, { status, headers });
  return Response.json(await setupCodeAnswer(db), { headers });
}
