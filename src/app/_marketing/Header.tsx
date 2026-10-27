import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/marketing';

const PAGES = [['/features', 'Features'], ['/faq', 'FAQ'], ['/contact', 'Contact']] as const;
export type Page = (typeof PAGES)[number][0];

/** `current` marks the page the visitor is on in both navs. */
export function Header({ current }: { current?: Page }) {
  const links = PAGES.map(([href, label]) => <a key={href} href={href} aria-current={href === current ? 'page' : undefined}>{label}</a>);
  return (
    <header className="site-head on-ink">
      <div className="wrap">
        <Link className="brand" href="/" aria-label={`${PRODUCT_NAME} home`} translate="no">
          <svg viewBox="0 0 34 34" aria-hidden="true"><rect x="8" y="8" width="18" height="18" rx="2" style={{ fill: 'var(--sky)' }} /><rect x="8" y="8" width="18" height="18" rx="2" style={{ fill: 'var(--sky)' }} transform="rotate(45 17 17)" /><circle cx="17" cy="17" r="4.5" style={{ fill: 'var(--ink)' }} /></svg>
          {PRODUCT_NAME}
        </Link>
        <nav className="site-nav" aria-label="Main">
          {links}
        </nav>
        <Link className="btn btn-sky" href="/#early-access"><span className="long">Start free trial</span><span className="short">Free trial</span></Link>
      </div>
      <nav className="mobile-nav" aria-label="Main (mobile)">
        {links}
      </nav>
    </header>
  );
}
