import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { certificate } from '@/db/schema';
import { certificatePdf } from '@/server/learning/merits';
import { requireParent } from '@/server/next/portal';

/** A child's certificate as a PDF, if it's shown on the portal and the child is this parent's. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await requireParent('Merits');
  const id = Number((await params).id);
  const ids = p.ctx.kids.map((k) => k.id);
  const [c] = Number.isInteger(id) && ids.length ? await db.select({ id: certificate.id }).from(certificate).where(and(eq(certificate.id, id), eq(certificate.onPortal, true), inArray(certificate.studentId, ids))) : [];
  const pdf = c ? await certificatePdf(db, c.id) : null;
  if (!pdf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${pdf.filename}"`, 'cache-control': 'private, no-store' } });
}
