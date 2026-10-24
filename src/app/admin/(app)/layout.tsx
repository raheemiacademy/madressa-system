import { cookies } from 'next/headers';
import { db } from '@/db';
import { resolveYear } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { getProfile } from '@/server/profile';
import { readTab } from '@/server/settings';
import { Shell } from './Shell';
import { runningDrill } from '@/server/attendance/drill';
import { countNotices, countPendingRequests } from '@/server/attendance/requests';
import { todayIso } from '@/server/people/common';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const chosen = Number((await cookies()).get('year_id')?.value) || null;
  const [profile, prefs, { years, year }, fire, drill, notices, requests] = await Promise.all([getProfile(db), readTab(db, 'preferences'), resolveYear(db, chosen), readTab(db, 'fire'), runningDrill(db), countNotices(db, todayIso()), countPendingRequests(db)]);
  const logoSrc = prefs.logoInSideMenu ? (profile?.logoFileId ? `/files/${profile.logoFileId}` : profile?.logoUrl ?? null) : null;
  return (
    <Shell school={profile?.name ?? 'School'} logoSrc={logoSrc} userName={admin.name} userEmail={admin.email}
      years={years.map((y) => ({ id: y.id, title: y.title }))} yearId={year?.id ?? null} noteColours={prefs.stickyNoteColours as string[]} drillPlaces={fire.buttonPlaces as string[]} drillRunning={!!drill} notifications={notices + requests} canFees={adminCan(admin.staff, 'fees')}>
      {children}
    </Shell>
  );
}
