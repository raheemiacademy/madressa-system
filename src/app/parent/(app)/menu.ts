import type { IconName } from '@/components/Icon';
import type { ParentUser } from '@/server/next/portal';
import { shows } from '@/server/portal/access';

export type MenuItem = { href: string; icon: IconName; label: string; desc: string; badge?: number };

/** Everything beyond the main tabs, for the More page and the desktop sidebar. Sections the school has hidden aren't listed. */
export function parentMenu(p: ParentUser, unread: number): MenuItem[] {
  return [
    { href: '/parent/messages', icon: 'mail', label: 'Messages', desc: unread ? `${unread} unread` : 'Write to the office or a teacher', badge: unread },
    ...([
      ['Events', '/parent/events', 'event', 'Events and trips', 'Opt in, give consent and pay'],
      ['Term Reports', '/parent/reports', 'exam', 'Term reports', 'End-of-term reports'],
      ['Exam Results', '/parent/results', 'exam', 'Exam results', 'Marks and grades'],
      ['Merits', '/parent/merits', 'star', 'Merits', 'Merits and certificates'],
      ['Incidents', '/parent/incidents', 'alert', 'Incidents', 'Incidents the school has shared'],
      ['Products', '/parent/shop', 'receipt', 'Shop', 'Buy from the school shop'],
      ['Files', '/parent/files', 'paperclip', 'Files', 'Documents from the school']
    ] as const).filter(([s]) => shows(p.ctx, s)).map(([, href, icon, label, desc]) => ({ href, icon, label, desc })),
    { href: '/parent/forums', icon: 'chat', label: 'Forums', desc: 'Talk with other parents and teachers' },
    { href: '/parent/child', icon: 'users', label: 'Your child’s details', desc: p.ctx.tab.walkHomeConsent ? 'Check details and walk-home consent' : 'Check the details the school holds' },
    { href: '/parent/change-password', icon: 'lock', label: 'Change password', desc: 'Choose a new password' }
  ];
}

/** The school's own links and social pages, from the parent portal settings. */
export function parentLinks(p: ParentUser) {
  return [...(p.ctx.tab.customLinks as { label: string; url: string }[] ?? []),
    ...(['website', 'facebook', 'instagram', 'twitter', 'linkedin', 'whatsapp'] as const).filter((k) => p.ctx.tab[k]).map((k) => ({ label: k === 'twitter' ? 'X (Twitter)' : k[0]!.toUpperCase() + k.slice(1), url: String(p.ctx.tab[k]) }))];
}
