import { db } from '@/db';
import { PortalSide } from '@/app/_portal/Side';
import { TabBar, type Tab } from '@/app/_portal/TabBar';
import { getProfile } from '@/server/profile';
import { parentLinks, parentMenu } from './menu';
import { requireParent } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { partyUnread } from '@/server/portal/messages';

export const dynamic = 'force-dynamic';

/** §20 Parent portal shell: bottom tabs (Home, Attendance, Fees, Homework, More) on phones, a sidebar on wide screens; hides sections the school has turned off. */
export default async function ParentApp({ children }: { children: React.ReactNode }) {
  const p = await requireParent();
  const [unread, profile] = await Promise.all([partyUnread(db, p.party), getProfile(db)]);
  const tabs: Tab[] = [
    { href: '/parent', label: 'Home', icon: 'home' },
    ...(shows(p.ctx, 'Attendance') ? [{ href: '/parent/attendance', label: 'Attendance', icon: 'check' } as Tab] : []),
    ...(shows(p.ctx, 'Fees') ? [{ href: '/parent/fees', label: 'Fees', icon: 'pound' } as Tab] : []),
    ...(shows(p.ctx, 'Homework') ? [{ href: '/parent/homework', label: 'Homework', icon: 'book' } as Tab] : []),
    { href: '/parent/more', label: 'More', icon: 'grid', badge: unread }
  ];
  return (
    <div className="rp rp-shell">
      <PortalSide school={profile?.name ?? 'School'} sub="Parent portal" portal="parent" links={parentLinks(p)}
        groups={[{ label: 'Your children', items: tabs.slice(0, -1) }, { label: 'More', items: parentMenu(p, unread) }]} />
      <div className="rp-body">{children}</div>
      <TabBar tabs={tabs} />
    </div>
  );
}
