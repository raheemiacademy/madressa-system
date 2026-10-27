import { db } from '@/db';
import { sendContactMessage } from '@/server/contact';

export const dynamic = 'force-dynamic';

/** The marketing site's contact form: JSON { name, email, school, topic, message }. */
export async function POST(req: Request) {
  if (process.env.MARKETING_SITE !== '1') return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const ip = process.env.TRUST_PROXY === '1' ? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null : null;
  const r = await sendContactMessage(db, body, ip);
  return Response.json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
}
