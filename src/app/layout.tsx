import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/ui.css';

// next/font downloads these at build time and serves them from our own origin — no runtime request to Google.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = { title: { default: 'School admin', template: '%s · School admin' }, robots: { index: false, follow: false } };

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F6FB' }, // eslint-disable-line no-restricted-syntax -- meta tag needs a literal; matches --color-bg
    { media: '(prefers-color-scheme: dark)', color: '#12152E' } // eslint-disable-line no-restricted-syntax -- matches dark --color-bg
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
