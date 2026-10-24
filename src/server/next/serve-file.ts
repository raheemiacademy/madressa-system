import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject } from '@/db/schema';
import { readStored } from '@/server/storage';

/** A private stored file as a response: images inline, everything else as a download, never cached, sandboxed. The caller checks access first. */
export async function serveFile(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [f] = await db.select().from(fileObject).where(eq(fileObject.id, id)).limit(1);
  const body = f ? await readStored(f.storageKey).catch(() => null) : null;
  if (!f || !body) return new Response('Not found', { status: 404 });
  const inline = (f.mime.startsWith('image/') && f.mime !== 'image/svg+xml') || f.mime.startsWith('audio/');
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': f.mime, 'Content-Length': String(body.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.filename.replace(/[^\w.\- ]/g, '_')}"`
    }
  });
}
