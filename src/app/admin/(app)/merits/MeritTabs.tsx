import Link from 'next/link';

const TABS: [string, string][] = [['/admin/merits', 'Awards'], ['/admin/merits/totals', 'Totals'], ['/admin/merits/types', 'Merits'], ['/admin/merits/achievements', 'Achievements'],
  ['/admin/merits/certificates', 'Certificates'], ['/admin/merits/teams', 'Teams'], ['/admin/products', 'Shop']];

/** The Merits & shop area's pages. */
export function MeritTabs({ current }: { current: string }) {
  return <nav className="ra-filters" aria-label="Merits and shop">{TABS.map(([h, l]) => <Link key={h} className="ra-filter" aria-current={current === h ? 'page' : undefined} href={h}>{l}</Link>)}</nav>;
}
