import localFont from 'next/font/local';
import '@/styles/marketing.css';
import { Chapters } from './Chapters';
import { Closing } from './Closing';
import { Compare } from './Compare';
import { EarlyAccess } from './EarlyAccess';
import { Faq } from './Faq';
import { Footer } from './Footer';
import { Header } from './Header';
import { Hero } from './Hero';
import { Motion } from './Motion';
import { Phones } from './Phones';
import { SwitchAndData } from './SwitchAndData';

// The design's Fraunces 400 with the optical-size axis (big headlines use the display cut), latin subset, as the reference
// loads it (SIL Open Font License). A separate file under its own name: the app's own Fraunces has no opsz axis and must not change.
const display = localFont({ src: './fonts/fraunces-opsz-400-latin.woff2', weight: '400', variable: '--font-ms-display', display: 'swap' });

/** The public homepage (design-reference/website/index.html). Everything sits inside .ms so its styles stay on this page. */
export function Home() {
  return (
    <div className={`ms ${display.variable}`}>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main">
        <Hero />
        <Compare />
        <Chapters />
        <Phones />
        <SwitchAndData />
        <EarlyAccess />
        <Faq />
        <Closing />
      </main>
      <Footer />
      <Motion />
    </div>
  );
}
