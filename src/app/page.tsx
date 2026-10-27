import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { PRODUCT_NAME } from '@/lib/marketing';
import { Home } from './_marketing/Home';

// MARKETING_SITE is read per request (not baked in at build): only the copy serving the main domain shows the homepage.
export const dynamic = 'force-dynamic';
const marketing = () => process.env.MARKETING_SITE === '1';
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34 34'%3E%3Crect width='34' height='34' rx='8' fill='%231C2147'/%3E%3Crect x='9' y='9' width='16' height='16' rx='2' fill='%2384CEEB'/%3E%3Crect x='9' y='9' width='16' height='16' rx='2' fill='%2384CEEB' transform='rotate(45 17 17)'/%3E%3Ccircle cx='17' cy='17' r='4' fill='%231C2147'/%3E%3C/svg%3E";

export async function generateMetadata(): Promise<Metadata> {
  if (!marketing()) return {};
  return {
    title: { absolute: `${PRODUCT_NAME} — run your madressa in one place` },
    description: 'Registers, fees, parents and teachers in one system built for maktabs, mosques and Islamic schools. Free during early access.',
    robots: { index: true, follow: true },
    icons: { icon: ICON }
  };
}

export async function generateViewport(): Promise<Viewport> {
  // eslint-disable-next-line no-restricted-syntax -- meta tag needs a literal; matches the homepage's --ink
  return marketing() ? { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1C2147', colorScheme: 'light' } : {};
}

/** The public homepage on the marketing copy; on every madrasah's copy, / goes to the admin app as before. */
export default function Root() {
  if (!marketing()) redirect('/admin');
  return <Home />;
}
