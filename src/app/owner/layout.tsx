import type { Metadata, Viewport } from 'next';
import { ownerAreaOnly } from '@/server/next/owner';
import '@/styles/owner.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Madressa Owner', template: '%s · Madressa Owner' }, robots: { index: false, follow: false },
  manifest: '/pwa/owner', appleWebApp: { capable: true, title: 'Owner', statusBarStyle: 'default' }, icons: { apple: '/icons/apple-touch-icon.png' }
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0F4C4A' }, // eslint-disable-line no-restricted-syntax -- meta tag needs a literal; matches the owner --side
    { media: '(prefers-color-scheme: dark)', color: '#0A2725' } // eslint-disable-line no-restricted-syntax -- matches the dark owner --side
  ]
};

/** The owner dashboard exists only on the main-site copy. */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  ownerAreaOnly();
  return <div className="ow">{children}</div>;
}
