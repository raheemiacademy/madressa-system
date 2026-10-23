import type { IconName } from '@/components/Icon';

export type NavItem = { href: string; label: string; icon: IconName };
// Same groups and order as the design's sidebar; each module's link is added in the phase that builds it.
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: 'home' }] },
  { group: 'System', items: [{ href: '/admin/settings', label: 'Settings', icon: 'cog' }, { href: '/admin/tools/sticky-notes', label: 'Sticky notes', icon: 'note' }] }
];

const EXTRA: { prefix: string; group: string; title: string }[] = [
  { prefix: '/admin/search', group: 'Overview', title: 'Search' },
  { prefix: '/admin/no-access', group: 'Overview', title: 'No access' }
];

export function crumbFor(pathname: string) {
  const extra = EXTRA.find((e) => pathname.startsWith(e.prefix));
  if (extra) return { group: extra.group, title: extra.title };
  let best: { group: string; title: string; len: number } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const hit = pathname === i.href || pathname.startsWith(i.href + '/');
    if (hit && (!best || i.href.length > best.len)) best = { group: g.group, title: i.label, len: i.href.length };
  }
  return best ?? { group: 'Overview', title: 'Dashboard' };
}

export const isCurrent = (pathname: string, href: string) => href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/');
