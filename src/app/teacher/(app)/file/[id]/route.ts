import { db } from '@/db';
import { requireTeacher } from '@/server/next/portal';
import { serveFile } from '@/server/next/serve-file';
import { portalCanSee } from '@/server/portal/shared';

/** Files a teacher can reach: shared documents, their classes' homework and hand-ins, and attachments on their messages. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const id = (await params).id;
  const ok = /^[0-9a-f-]{36}$/.test(id) && await portalCanSee(db, { party: t.party, audience: 'teachers', classIds: t.ctx.classes.map((c) => c.id), studentIds: [] }, id);
  return ok ? serveFile(id) : new Response('Not found', { status: 404 });
}
