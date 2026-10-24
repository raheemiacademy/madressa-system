import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { KIOSK_COOKIE, kioskTeachers, validKiosk } from '@/server/attendance/teacher-logs';
import { getProfile } from '@/server/profile';
import { KioskForm } from './KioskForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in or out' };

/** §7 kiosk: teachers sign in and out with their PIN, only on devices an admin has set up. */
export default async function Kiosk() {
  const ok = await validKiosk(db, (await cookies()).get(KIOSK_COOKIE)?.value);
  const school = await getProfile(db);
  return (
    <main className="ra-auth">
      <div className="ra-auth-card">
        <div><div className="ra-muted" style={{ fontSize: 13 }}>{school?.name ?? 'School'}</div><h1>Teacher sign in and out</h1></div>
        {ok ? <KioskForm teachers={await kioskTeachers(db)} /> : <p className="ra-banner" style={{ ['--c' as string]: 'var(--ra-blue)' }}>This device isn’t set up as a kiosk. An administrator can set it up under Teacher logs → Kiosk devices.</p>}
      </div>
    </main>
  );
}
