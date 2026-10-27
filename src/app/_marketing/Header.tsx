import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/marketing';

export function Header() {
  return (
    <header className="site-head on-ink">
      <div className="wrap">
        <Link className="brand" href="/" aria-label={`${PRODUCT_NAME} home`} translate="no">
          <svg viewBox="0 0 34 34" aria-hidden="true"><rect x="8" y="8" width="18" height="18" rx="2" style={{ fill: 'var(--sky)' }} /><rect x="8" y="8" width="18" height="18" rx="2" style={{ fill: 'var(--sky)' }} transform="rotate(45 17 17)" /><circle cx="17" cy="17" r="4.5" style={{ fill: 'var(--ink)' }} /></svg>
          {PRODUCT_NAME}
        </Link>
        <nav className="site-nav" aria-label="Main">
          <a href="/features">Features</a>
          <a href="/faq">FAQ</a>
          <a href="/contact">Contact</a>
        </nav>
        <a className="btn btn-sky" href="#early-access"><span className="long">Start free trial</span><span className="short">Free trial</span></a>
      </div>
      <nav className="mobile-nav" aria-label="Main (mobile)">
        <a href="/features">Features</a><a href="/faq">FAQ</a><a href="/contact">Contact</a>
      </nav>
    </header>
  );
}
