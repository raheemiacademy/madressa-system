import { NextResponse } from 'next/server';
import { portalBadges } from '@/server/badges';
import { getParent } from '@/server/next/portal';

export const dynamic = 'force-dynamic';

/** This parent's unread message count, for LiveBadges to poll. Signed-in parents only. */
export async function GET() {
  const u = await getParent();
  if (!u) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  return NextResponse.json(await portalBadges(u), { headers: { 'Cache-Control': 'no-store' } });
}
