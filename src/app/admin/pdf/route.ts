import { cookies } from 'next/headers';
import { cookieName } from '@/server/auth';
import { adminPageToPdf } from '@/server/comm/pdf';
import { getAdmin } from '@/server/next/actor';

export const dynamic = 'force-dynamic';

/** "Download PDF" for any admin print layout: Chromium opens the page as the signed-in user and prints it. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response('Not found', { status: 404 });
  const path = new URL(req.url).searchParams.get('path') ?? '';
  const value = (await cookies()).get(cookieName('admin'))?.value;
  if (!value || !path.startsWith('/admin/') || path.startsWith('/admin/pdf')) return new Response('Not found', { status: 404 });
  // The server talks to itself directly, not through the public proxy.
  const origin = `http://127.0.0.1:${process.env.PORT || new URL(req.url).port || 3000}`;
  try {
    const pdf = await adminPageToPdf(origin, path, { name: cookieName('admin'), value });
    const name = path.split('?')[0]!.replace(/^\/admin\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'page';
    return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}.pdf"`, 'cache-control': 'no-store' } });
  } catch {
    return new Response('That page couldn’t be turned into a PDF.', { status: 404 });
  }
}
