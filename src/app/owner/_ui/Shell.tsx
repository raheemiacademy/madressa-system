'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand, Icon, type IconName } from './icons';

const NAV: [IconName, string, string][] = [
  ['overview', 'Overview', '/owner'], ['madrasahs', 'Madrasahs', '/owner/madrasahs'], ['leads', 'Leads', '/owner/leads'],
  ['server', 'Server', '/owner/server'], ['alerts', 'Alerts', '/owner/alerts'], ['account', 'Account', '/owner/account']
];
// Server and Account are reached from the account button in the top bar on a phone.
const TABS: IconName[] = ['overview', 'madrasahs', 'leads', 'alerts'];

/** `attention`: madrasahs needing a look, each counted once even when it is both down and flagged. */
export function Shell({ attention, children }: { attention: number; children: React.ReactNode }) {
  const path = usePathname();
  const current = (href: string) => (href === '/owner' ? path === href : path === href || path.startsWith(`${href}/`)) ? 'page' as const : undefined;
  const badge = (k: IconName) => k === 'madrasahs' && attention ? <span className="count" aria-label={`${attention} need${attention === 1 ? 's' : ''} attention`}>{attention}</span> : null;
  return (
    <div className="shell">
      <a className="skip" href="#view">Skip to content</a>
      <aside className="side" aria-label="Owner menu">
        <Brand />
        <nav className="nav" aria-label="Owner">
          {NAV.map(([k, label, href]) => <Link key={k} href={href} aria-current={current(href)}><Icon name={k} /><span>{label}</span>{badge(k)}</Link>)}
        </nav>
      </aside>
      <div className="main">{children}</div>
      <nav className="tabs" aria-label="Owner (mobile)">
        {NAV.filter(([k]) => TABS.includes(k)).map(([k, label, href]) => <Link key={k} href={href} aria-current={current(href)}><Icon name={k} />{label}{badge(k)}</Link>)}
      </nav>
    </div>
  );
}
