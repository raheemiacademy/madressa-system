import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject } from '@/db/schema';
import { getAdmin } from '@/server/next/actor';
import { readStored } from '@/server/storage';

/** Private files (student photos and attachments) for signed-in admin staff, always as downloads except images. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [f] = await db.select().from(fileObject).where(eq(fileObject.id, id)).limit(1);
  const body = f ? await readStored(f.storageKey).catch(() => null) : null;
  if (!f || !body) return new Response('Not found', { status: 404 });
  const inline = f.mime.startsWith('image/') && f.mime !== 'image/svg+xml';
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': f.mime, 'Content-Length': String(body.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.filename.replace(/[^\w.\- ]/g, '_')}"`
    }
  });
}
