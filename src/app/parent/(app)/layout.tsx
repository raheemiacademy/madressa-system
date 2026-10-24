import { db } from '@/db';
import { TabBar, type Tab } from '@/app/_portal/TabBar';
import { requireParent } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { partyUnread } from '@/server/portal/messages';

export const dynamic = 'force-dynamic';

/** §20 Parent portal shell: bottom tabs (Home, Attendance, Fees, Homework, More), hiding sections the school has turned off. */
export default async function ParentApp({ children }: { children: React.ReactNode }) {
  const p = await requireParent();
  const unread = await partyUnread(db, p.party);
  const tabs: Tab[] = [
    { href: '/parent', label: 'Home', icon: 'home' },
    ...(shows(p.ctx, 'Attendance') ? [{ href: '/parent/attendance', label: 'Attendance', icon: 'check' } as Tab] : []),
    ...(shows(p.ctx, 'Fees') ? [{ href: '/parent/fees', label: 'Fees', icon: 'pound' } as Tab] : []),
    ...(shows(p.ctx, 'Homework') ? [{ href: '/parent/homework', label: 'Homework', icon: 'book' } as Tab] : []),
    { href: '/parent/more', label: 'More', icon: 'grid', badge: unread }
  ];
  return <div className="rp">{children}<TabBar tabs={tabs} /></div>;
}
