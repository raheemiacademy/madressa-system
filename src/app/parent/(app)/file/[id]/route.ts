import { db } from '@/db';
import { requireParent } from '@/server/next/portal';
import { serveFile } from '@/server/next/serve-file';
import { portalCanSee } from '@/server/portal/shared';

/** Files a parent can reach: shared documents, their children's homework and hand-ins, and attachments on their messages. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await requireParent();
  const id = (await params).id;
  const ok = /^[0-9a-f-]{36}$/.test(id) && await portalCanSee(db, { party: p.party, audience: 'parents', classIds: p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c), studentIds: p.ctx.kids.map((k) => k.id) }, id);
  return ok ? serveFile(id) : new Response('Not found', { status: 404 });
}
