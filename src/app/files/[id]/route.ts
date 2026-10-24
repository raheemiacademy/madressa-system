import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject } from '@/db/schema';
import { readStored } from '@/server/storage';

// Only branding files and newsletter media are public (they're seen before anyone signs in, or in emails).
const PUBLIC_PURPOSES = ['logo', 'portal-background', 'newsletter-image', 'newsletter-file'];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [f] = await db.select().from(fileObject).where(and(eq(fileObject.id, id), inArray(fileObject.purpose, PUBLIC_PURPOSES))).limit(1);
  if (!f) return new Response('Not found', { status: 404 });
  const body = await readStored(f.storageKey).catch(() => null);
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': f.mime, 'Content-Length': String(body.length), 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
      ...(f.purpose === 'newsletter-file' ? { 'Content-Disposition': `attachment; filename="${f.filename.replace(/[^\w. -]/g, '_')}"` } : {}) }
  });
}
