import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import '@/styles/marketing.css';
import { Footer } from './Footer';
import { Header, type Page } from './Header';
import { Motion } from './Motion';

// The design's Fraunces 400 with the optical-size axis (big headlines use the display cut), latin subset, as the reference
// loads it (SIL Open Font License). A separate file under its own name: the app's own Fraunces has no opsz axis and must not change.
const display = localFont({ src: './fonts/fraunces-opsz-400-latin.woff2', weight: '400', variable: '--font-ms-display', display: 'swap' });

/** Every marketing page's frame. Everything sits inside .ms so its styles stay on these pages. */
export function Shell({ current, children }: { current?: Page; children: ReactNode }) {
  return (
    <div className={`ms ${display.variable}`}>
      <a className="skip" href="#main">Skip to content</a>
      <Header current={current} />
      <main id="main">{children}</main>
      <Footer />
      <Motion />
    </div>
  );
}
