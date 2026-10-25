import { cookies } from 'next/headers';
import Link from 'next/link';
import { db } from '@/db';
import { logoutAction } from '@/app/_auth/actions';
import { Icon } from '@/components/Icon';
import { initials } from '@/lib/text';
import { resolveYear } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { readTab } from '@/server/settings';
import { NAV } from '../../nav';
import { YearSwitcher } from '../Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'More' };

/** The phone app's "More" tab: every section from the side menu, the year switcher, the fire drill and signing out. */
export default async function More() {
  const admin = await requireAdmin();
  const [{ years, year }, fire] = await Promise.all([resolveYear(db, Number((await cookies()).get('year_id')?.value) || null), readTab(db, 'fire')]);
  const areas = [...(adminCan(admin.staff, 'fees') ? ['fees'] : []), ...(adminCan(admin.staff, 'marketing') || adminCan(admin.staff, 'sms') ? ['comm'] : [])];
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.need || areas.includes(i.need)) })).filter((g) => g.items.length);
  return (
    <div className="ra-page ra-menu-page">
      <div className="ra-page-h"><div><h1>More</h1></div></div>
      <section className="ra-card ra-more-me" aria-label="Your account">
        <span className="ra-avatar" aria-hidden="true">{initials(admin.name)}</span>
        <span><b>{admin.name}</b><small>{admin.email}</small></span>
        <form action={logoutAction.bind(null, 'admin')}><button className="ra-btn" type="submit">Sign out</button></form>
      </section>
      <div className="ra-more-year"><span aria-hidden="true">Academic year</span><YearSwitcher years={years.map((y) => ({ id: y.id, title: y.title }))} yearId={year?.id ?? null} /></div>
      {(fire.buttonPlaces as string[]).length > 0 && (
        <Link className="ra-drill-row tap" href="/admin/fire-drill"><Icon name="fire" /><span>Fire drill</span><small>Hold to start</small></Link>
      )}
      {groups.map((g) => (
        <nav key={g.group} aria-labelledby={`more-${g.group}`}>
          <h2 id={`more-${g.group}`} className="ra-more-h">{g.group}</h2>
          <ul className="rp-list">
            {g.items.map((i) => (
              <li key={i.href}><Link className="tap" href={i.href}><span className="ra-more-row"><span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-indigo)' }}><Icon name={i.icon} /></span><span className="t">{i.label}</span></span></Link></li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}
