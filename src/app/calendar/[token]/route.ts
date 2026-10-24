import { db } from '@/db';
import { buildIcs } from '@/server/ops/system';

export const dynamic = 'force-dynamic';

/** §19 Calendar (ICS) feed: subscribe in Google, Apple or Outlook calendars. The address is the secret; it holds no personal data. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '');
  const body = /^[A-Za-z0-9_-]{20,40}$/.test(token) ? await buildIcs(db, token) : null;
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(body, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900', 'content-disposition': 'inline; filename="school-calendar.ics"' } });
}
