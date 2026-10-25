import { db } from '@/db';
import { PortalSide } from '@/app/_portal/Side';
import { TabBar, type Tab } from '@/app/_portal/TabBar';
import { getProfile } from '@/server/profile';
import { teacherLinks, teacherMenu } from './menu';
import { requireTeacher } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { partyUnread } from '@/server/portal/messages';

export const dynamic = 'force-dynamic';

/** §20 Teacher portal shell (design: TeacherToday tabs): Today, Register, Homework, Messages, More on phones; a sidebar on wide screens. */
export default async function TeacherApp({ children }: { children: React.ReactNode }) {
  const t = await requireTeacher();
  const [unread, profile] = await Promise.all([partyUnread(db, t.party), getProfile(db)]);
  const tabs: Tab[] = [
    { href: '/teacher', label: 'Today', icon: 'home' },
    ...(shows(t.ctx, 'Registers') ? [{ href: '/teacher/register', label: 'Register', icon: 'check' } as Tab] : []),
    ...(shows(t.ctx, 'Homework') ? [{ href: '/teacher/homework', label: 'Homework', icon: 'book' } as Tab] : []),
    { href: '/teacher/messages', label: 'Messages', icon: 'mail', badge: unread },
    { href: '/teacher/more', label: 'More', icon: 'grid' }
  ];
  return (
    <div className="rp rp-shell rp-teacher">
      <PortalSide school={profile?.name ?? 'School'} sub="Teacher portal" portal="teacher" links={teacherLinks(t)}
        groups={[{ label: 'Teaching', items: tabs.slice(0, -1) }, { label: 'More', items: teacherMenu(t) }]} />
      <div className="rp-body">{children}</div>
      <TabBar tabs={tabs} />
    </div>
  );
}
