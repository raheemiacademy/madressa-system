import { db } from '@/db';
import { ownerAdminLink } from '@/server/owner/admin-link';
import { summaryAccess } from '@/server/owner/summary';

export const dynamic = 'force-dynamic';

/** The owner dashboard asks a madrasah copy for an admin's set-password link: same private network and token as the summary. */
export async function POST(req: Request) {
  const status = summaryAccess(req.headers);
  const headers = { 'cache-control': 'no-store' };
  if (status !== 200) return new Response(null, { status, headers });
  const r = await ownerAdminLink(db, await req.json().catch(() => null));
  return Response.json(r.status === 200 ? { link: r.link } : { error: r.error }, { status: r.status, headers });
}
