import Link from 'next/link';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { contact, loginIdentity, teacher } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { appUrl } from '@/server/password-links';
import { readTab } from '@/server/settings';

export const metadata = { title: 'Portals' };

/** §19 Tools → Portals: each portal's address and status, and who has used them in the last 30 days. */
export default async function Portals() {
  await requireAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [parentTab, parents, teachers] = await Promise.all([
    readTab(db, 'parentPortal'),
    db.select({ name: contact.name, at: loginIdentity.lastLoginAt }).from(loginIdentity).innerJoin(contact, eq(contact.id, loginIdentity.contactId))
      .where(and(eq(loginIdentity.portal, 'parent'), isNotNull(loginIdentity.lastLoginAt), gte(loginIdentity.lastLoginAt, since))).orderBy(desc(loginIdentity.lastLoginAt)),
    db.select({ name: teacher.name, at: loginIdentity.lastLoginAt }).from(loginIdentity).innerJoin(teacher, eq(teacher.id, loginIdentity.teacherId))
      .where(and(eq(loginIdentity.portal, 'teacher'), isNotNull(loginIdentity.lastLoginAt), gte(loginIdentity.lastLoginAt, since))).orderBy(desc(loginIdentity.lastLoginAt))
  ]);
  const base = appUrl();
  const rows: [string, string, boolean, { name: string; at: Date | null }[] | null, string][] = [
    ['Parent portal', '/parent', !parentTab.disabled, parents, '/admin/settings/parentPortal'],
    ['Teacher portal', '/teacher', true, teachers, '/admin/settings/teacherPortal'],
    ['Student portal', '/student', false, null, '/admin/settings/studentPortal']
  ];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Portals</h1><p>Where parents and teachers sign in, and who has used them in the last 30 days</p></div></div>
      {rows.map(([name, path, on, users, settings]) => (
        <section key={path} className="ra-card" aria-labelledby={`p-${path.slice(1)}`}>
          <div className="ra-card-h"><div><h2 id={`p-${path.slice(1)}`}>{name} <Chip colour={on ? 'var(--color-ok)' : 'var(--color-fg-muted)'}>{on ? 'Open' : path === '/student' ? 'Not in use yet' : 'Closed'}</Chip></h2>
            <div className="ra-note">{base}{path} · installs as an app on phones</div></div><Link className="ra-link" href={settings}>Settings</Link></div>
          {users && (users.length === 0 ? <p className="ra-empty">Nobody has signed in in the last 30 days.</p> : (
            <>
              <p style={{ margin: '0 0 8px' }}><b>{users.length === 1 ? '1 person' : `${users.length} people`}</b> signed in in the last 30 days.</p>
              <div className="ra-table-wrap" style={{ maxHeight: 320 }}><table className="ra-table"><thead><tr><th>Name</th><th>Last signed in</th></tr></thead>
                <tbody>{users.map((u, i) => <tr key={i}><td className="wrap">{u.name}</td><td>{u.at ? formatInstant(u.at, 'dd/MM/yyyy HH:mm') : '—'}</td></tr>)}</tbody></table></div>
            </>
          ))}
        </section>
      ))}
    </div>
  );
}
