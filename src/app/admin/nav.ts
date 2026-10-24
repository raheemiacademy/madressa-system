import type { IconName } from '@/components/Icon';

// `need` names an access area: the link only shows for staff who have it (the server checks again).
export type NavItem = { href: string; label: string; icon: IconName; need?: 'fees' | 'comm' };
// Same groups and order as the design's sidebar; each module's link is added in the phase that builds it.
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: 'home' }] },
  { group: 'School', items: [{ href: '/admin/students', label: 'Students', icon: 'users' }, { href: '/admin/classes', label: 'Classes', icon: 'grid' }, { href: '/admin/teachers', label: 'Teachers', icon: 'teacher' }, { href: '/admin/register', label: 'Register', icon: 'check' }, { href: '/admin/teacher-logs', label: 'Teacher logs', icon: 'clock' }] },
  { group: 'Finance', items: [{ href: '/admin/fees', label: 'Fees', icon: 'pound', need: 'fees' }] },
  { group: 'Communication', items: [{ href: '/admin/messages', label: 'Messages', icon: 'mail' }, { href: '/admin/newsletters', label: 'Newsletters & SMS', icon: 'send', need: 'comm' }] },
  { group: 'System', items: [{ href: '/admin/settings', label: 'Settings', icon: 'cog' }, { href: '/admin/tools/sticky-notes', label: 'Sticky notes', icon: 'note' }] }
];

const EXTRA: { prefix: string; group: string; title: string }[] = [
  { prefix: '/admin/search', group: 'Overview', title: 'Search' },
  { prefix: '/admin/no-access', group: 'Overview', title: 'No access' },
  { prefix: '/admin/contacts', group: 'School', title: 'Contacts' },
  { prefix: '/admin/import', group: 'School', title: 'Import' },
  { prefix: '/admin/fire-drill', group: 'School', title: 'Fire drill' }
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
