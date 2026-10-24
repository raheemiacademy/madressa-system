import { TABS } from '@/settings/tabs';

export type Section = { href: string; label: string };
const ADMIN: Section[] = [
  { href: '/admin/settings/profile', label: 'School profile' },
  { href: '/admin/settings/years', label: 'Academic years' },
  { href: '/admin/settings/years/wizard', label: 'New year wizard' },
  { href: '/admin/settings/years/stats', label: 'Yearly comparison stats' },
  { href: '/admin/settings/holidays', label: 'Calendar & holidays' },
  { href: '/admin/settings/staff', label: 'Admin staff' },
  { href: '/admin/settings/audits', label: 'Audits' },
  { href: '/admin/settings/year-groups', label: 'Year & age groups' },
  { href: '/admin/settings/custom-fields', label: 'Custom fields' },
  { href: '/admin/settings/attendance-codes', label: 'Attendance codes' }
];
const GROUPS = ['General', 'School', 'Finance', 'Communication', 'Learning', 'Portals', 'System'];

export const SECTION_GROUPS: { group: string; items: Section[] }[] = [
  { group: 'Administration', items: ADMIN },
  ...GROUPS.map((g) => ({ group: g, items: TABS.filter((t) => t.group === g).map((t) => ({ href: `/admin/settings/${t.key}`, label: t.title })) })).filter((g) => g.items.length)
];
