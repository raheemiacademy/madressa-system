import { db } from '@/db';
import { getAdmin } from '@/server/next/actor';
import { certificatePdf } from '@/server/learning/merits';

/** One certificate as a PDF (pdf-lib on the template's background). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  const id = Number((await params).id);
  const pdf = Number.isInteger(id) ? await certificatePdf(db, id) : null;
  if (!pdf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${pdf.filename}"`, 'cache-control': 'no-store' } });
}
