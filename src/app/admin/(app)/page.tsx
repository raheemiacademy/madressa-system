import { db } from '@/db';
import { formatInstant, greeting } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { readTab } from '@/server/settings';

export const metadata = { title: 'Dashboard' };

// shortcut: hero only. The full dashboard is built against real queries in Phase 7.
export default async function Dashboard() {
  const admin = await requireAdmin();
  const local = await readTab(db, 'local');
  const now = new Date();
  const tz = local.timezone as string;
  return (
    <div className="ra-page">
      <div className="ra-hero">
        <div className="ra-hero-date">{formatInstant(now, 'EEEE d MMMM', tz)}</div>
        <h1>{greeting(now, tz)}, {admin.name.split(/\s+/)[0]}</h1>
        <p>Figures for attendance, fees and messages appear here once those modules hold data.</p>
      </div>
    </div>
  );
}
