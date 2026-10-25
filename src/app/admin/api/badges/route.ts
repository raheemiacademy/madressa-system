import { NextResponse } from 'next/server';
import { adminBadges } from '@/server/badges';
import { getAdmin } from '@/server/next/actor';

export const dynamic = 'force-dynamic';

/** The admin header's counts, for LiveBadges to poll. Signed-in admins only. */
export async function GET() {
  const a = await getAdmin();
  if (!a) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  return NextResponse.json(await adminBadges(a), { headers: { 'Cache-Control': 'no-store' } });
}
