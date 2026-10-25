import { cookies } from 'next/headers';
import { db } from '@/db';
import { resolveYear } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { getProfile } from '@/server/profile';
import { readTab } from '@/server/settings';
import { Shell } from './Shell';
import { THEME_COOKIE } from '@/lib/theme';
import { runningDrill } from '@/server/attendance/drill';
import { adminBadges } from '@/server/badges';
import { formatInstant } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const chosen = Number((await cookies()).get('year_id')?.value) || null;
  const [profile, prefs, { years, year }, fire, drill, badges] = await Promise.all([getProfile(db), readTab(db, 'preferences'), resolveYear(db, chosen), readTab(db, 'fire'), runningDrill(db), adminBadges(admin)]);
  const areas = [...(adminCan(admin.staff, 'fees') ? ['fees' as const] : []), ...(adminCan(admin.staff, 'marketing') || adminCan(admin.staff, 'sms') ? ['comm' as const] : [])];
  const logoSrc = prefs.logoInSideMenu ? (profile?.logoFileId ? `/files/${profile.logoFileId}` : profile?.logoUrl ?? null) : null;
  const theme = ['light', 'dark'].includes(String(prefs.theme)) ? String(prefs.theme) : null;
  return (
    <>
      {/* §3 the school's theme: set before the page paints, unless this device has chosen its own with the Dark mode switch. */}
      <script dangerouslySetInnerHTML={{ __html: `if(!/(?:^|; )${THEME_COOKIE}=/.test(document.cookie)){${theme ? `document.documentElement.dataset.theme=${JSON.stringify(theme)}` : 'delete document.documentElement.dataset.theme'}}` }} />
      <Shell school={profile?.name ?? 'School'} logoSrc={logoSrc} userName={admin.name} userEmail={admin.email} todayLabel={formatInstant(new Date(), 'EEE d MMMM')}
      years={years.map((y) => ({ id: y.id, title: y.title }))} yearId={year?.id ?? null} drillPlaces={fire.buttonPlaces as string[]} drillRunning={!!drill} notifications={badges.notifications} unreadMessages={badges.messages} areas={areas}>
      {children}
      </Shell>
    </>
  );
}
