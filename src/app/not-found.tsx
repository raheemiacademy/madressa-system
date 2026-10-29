import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/db';
import { getProfile } from '@/server/profile';
import { HomeButtons } from './_auth/HomeButtons';
import { isMarketing } from './_marketing/meta';
import { PageHero } from './_marketing/PageHero';
import { Shell } from './_marketing/Shell';

export const metadata: Metadata = { title: 'Page not found' };

/** The logo turns once into place as the page appears (ui.css .ra-404). */
const STAR = (
  <svg className="ra-404-star" viewBox="0 0 34 34" aria-hidden="true">
    <rect x="8" y="8" width="18" height="18" rx="2" style={{ fill: 'var(--ra-sky)' }} />
    <rect x="8" y="8" width="18" height="18" rx="2" style={{ fill: 'var(--ra-sky)' }} transform="rotate(45 17 17)" />
    <circle cx="17" cy="17" r="4.5" style={{ fill: 'var(--ra-ink)' }} />
  </svg>
);

/** Any address that isn't a page: the website's look on the main site, the app's on a madrasah's copy. */
export default async function NotFound() {
  if (isMarketing()) return (
    <Shell>
      <PageHero title="This page isn’t here" lede="The link may be old, or the page has moved.">
        <Link className="btn btn-sky" href="/">Go to the home page</Link>
      </PageHero>
    </Shell>
  );
  const profile = await getProfile(db).catch(() => null);
  return (
    <main className="ra-auth">
      <div className="ra-auth-card ra-404">
        {STAR}
        <div><div className="ra-muted" style={{ fontSize: 13 }}>{profile?.name ?? 'School'}</div><h1>This page isn’t here</h1>
          <p className="ra-note" style={{ margin: '6px 0 0' }}>The link may be old, or the page has moved. Nothing is lost.</p></div>
        <HomeButtons />
      </div>
    </main>
  );
}
