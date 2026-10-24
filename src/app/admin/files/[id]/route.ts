import { getAdmin } from '@/server/next/actor';
import { serveFile } from '@/server/next/serve-file';

/** Private files (student photos and attachments) for signed-in admin staff, always as downloads except images. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  return serveFile((await params).id);
}
