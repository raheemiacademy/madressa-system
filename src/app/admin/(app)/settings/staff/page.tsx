import Link from 'next/link';
import { db } from '@/db';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { listStaff } from '@/server/staff';
import { Icon } from '@/components/Icon';
import { DeleteStaff } from './DeleteStaff';
import { ACCESS_LEVELS } from '@/lib/access-levels';

export const metadata = { title: 'Admin staff' };

export default async function StaffPage() {
  const me = await requireAdmin('super');
  const rows = await listStaff(db);
  const today = formatInstant(new Date(), 'yyyy-MM-dd');
  return (
    <section className="ra-card" aria-labelledby="staff-h">
      <div className="ra-card-h">
        <div><h2 id="staff-h">Admin staff</h2><div className="ra-note">{plural(rows.length, 'staff member')}</div></div>
        <Link className="ra-btn primary" href="/admin/settings/staff/new"><Icon name="plus" />Add staff</Link>
      </div>
      <div className="ra-table-wrap" tabIndex={0}>
        <table className="ra-table">
          <thead><tr><th>Name</th><th className="opt">Rank</th><th>Access</th><th className="opt">DBS expiry</th><th className="opt">Last login</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map(({ s, allowLogin, lastLoginAt }) => {
              const levels = ACCESS_LEVELS.filter(([k]) => s[k]).map(([, l]) => l.replace(/ \(.*\)$/, ''));
              const dbsExpired = s.dbsExpiresOn && s.dbsExpiresOn < today;
              return (
                <tr key={s.id}>
                  <td className="wrap">{s.name}<div className="ra-note">{s.email}</div></td>
                  <td className="opt wrap">{s.rank ?? ''}</td>
                  <td className="wrap">{allowLogin ? (levels.join(', ') || 'View only') : <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-fg-muted)' }}><span>Login off</span></span>}</td>
                  <td className="opt">{s.dbsExpiresOn ? <span className={dbsExpired ? 'ra-warn' : undefined}>{formatCalendarDate(s.dbsExpiresOn)}{dbsExpired ? ' · expired' : ''}</span> : ''}</td>
                  <td className="opt ra-muted">{lastLoginAt ? formatInstant(lastLoginAt, 'dd/MM/yyyy HH:mm') : 'Never'}</td>
                  <td><span className="ra-acts"><Link href={`/admin/settings/staff/${s.id}`} aria-label={`Edit ${s.name}`}><Icon name="edit" /></Link>{s.id !== me.staff.id && <DeleteStaff id={s.id} name={s.name} />}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
