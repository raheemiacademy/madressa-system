import { TABS } from '@/settings/tabs';

export type Section = { href: string; label: string };
const ADMIN: Section[] = [
  { href: '/admin/settings/profile', label: 'School profile' },
  { href: '/admin/settings/years', label: 'Academic years' },
  { href: '/admin/settings/holidays', label: 'Calendar & holidays' },
  { href: '/admin/settings/staff', label: 'Admin staff' },
  { href: '/admin/settings/audits', label: 'Audits' }
];
const GROUPS = ['General', 'School', 'Finance', 'Communication', 'Learning', 'Portals', 'System'];

export const SECTION_GROUPS: { group: string; items: Section[] }[] = [
  { group: 'Administration', items: ADMIN },
  ...GROUPS.map((g) => ({ group: g, items: TABS.filter((t) => t.group === g).map((t) => ({ href: `/admin/settings/${t.key}`, label: t.title })) })).filter((g) => g.items.length)
];
