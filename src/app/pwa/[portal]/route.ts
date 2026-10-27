import { db } from '@/db';
import { getProfile } from '@/server/profile';
import { ownerEnabled } from '@/server/owner/auth';

export const dynamic = 'force-dynamic';

const NAMES: Record<string, string> = { parent: 'Parents', teacher: 'Teachers' };

/** Web app manifest for an installable portal (/pwa/parent, /pwa/teacher). Public: it holds only the school's name. */
export async function GET(_req: Request, { params }: { params: Promise<{ portal: string }> }) {
  const portal = (await params).portal;
  const icons = [192, 512].flatMap((s) => [{ src: `/icons/app-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' }, { src: `/icons/app-${s}-maskable.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'maskable' }]);
  const headers = { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' };
  // The owner dashboard, on the main site only.
  if (portal === 'owner' && ownerEnabled()) return Response.json({
    name: 'Madressa Owner', short_name: 'Owner', id: '/owner', start_url: '/owner', scope: '/owner', display: 'standalone', lang: 'en-GB',
    /* eslint-disable no-restricted-syntax -- manifest colours must be literals; they match the owner --bg and --side */
    background_color: '#F6F4EF', theme_color: '#0F4C4A',
    /* eslint-enable no-restricted-syntax */
    icons
  }, { headers });
  if (!NAMES[portal]) return new Response('Not found', { status: 404 });
  const school = (await getProfile(db))?.name ?? 'School';
  return Response.json({
    name: `${school} ${NAMES[portal]}`, short_name: NAMES[portal], id: `/${portal}`, start_url: `/${portal}`, scope: `/${portal}`, display: 'standalone', lang: 'en-GB',
    /* eslint-disable no-restricted-syntax -- manifest colours must be literals; they match --color-bg and --ra-ink */
    background_color: '#F5F6FB', theme_color: '#1C2147',
    /* eslint-enable no-restricted-syntax */
    icons
  }, { headers });
}
