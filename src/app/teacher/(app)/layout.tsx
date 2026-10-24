import { db } from '@/db';
import { TabBar, type Tab } from '@/app/_portal/TabBar';
import { requireTeacher } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { partyUnread } from '@/server/portal/messages';

export const dynamic = 'force-dynamic';

/** §20 Teacher portal shell (design: TeacherToday tabs): Today, Register, Homework, Messages, More. */
export default async function TeacherApp({ children }: { children: React.ReactNode }) {
  const t = await requireTeacher();
  const unread = await partyUnread(db, t.party);
  const tabs: Tab[] = [
    { href: '/teacher', label: 'Today', icon: 'home' },
    ...(shows(t.ctx, 'Registers') ? [{ href: '/teacher/register', label: 'Register', icon: 'check' } as Tab] : []),
    ...(shows(t.ctx, 'Homework') ? [{ href: '/teacher/homework', label: 'Homework', icon: 'book' } as Tab] : []),
    { href: '/teacher/messages', label: 'Messages', icon: 'mail', badge: unread },
    { href: '/teacher/more', label: 'More', icon: 'grid' }
  ];
  return <div className="rp">{children}<TabBar tabs={tabs} /></div>;
}
