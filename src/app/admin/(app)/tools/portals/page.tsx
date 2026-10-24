import Link from 'next/link';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { contact, loginIdentity, teacher } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { appUrl } from '@/server/password-links';
import { pendingInvites } from '@/server/onboarding';
import { readTab } from '@/server/settings';
import { ActionButton } from '@/components/Form';
import { inviteAction } from '../../onboarding-actions';

export const metadata = { title: 'Portals' };

/** §19 Tools → Portals: each portal's address and status, and who has used them in the last 30 days. */
export default async function Portals() {
  const admin = await requireAdmin();
  const waiting = await pendingInvites(db);
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
    ['Teacher portal', '/teacher', true, teachers, '/admin/settings/teacherPortal']
  ];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Portals</h1><p>Where parents and teachers sign in, and who has used them in the last 30 days</p></div></div>
      {admin.staff.isSuper && (
        <section className="ra-card" id="invite" aria-labelledby="inv-h">
          <div className="ra-card-h"><div><h2 id="inv-h">Invite parents and teachers</h2>
            <div className="ra-note">Gives every teacher, and every parent of a current student, who has an email address a login. Then emails anyone who hasn’t chosen a password yet a link to do so (it lasts 48 hours, and they can ask for another from the sign-in page). People who already have a password aren’t emailed.</div></div></div>
          <p style={{ margin: '0 0 10px' }}>{waiting === 1 ? '1 person has a login but hasn’t chosen a password yet.' : `${waiting} people have a login but haven’t chosen a password yet.`}</p>
          <ActionButton action={inviteAction} label="Invite parents and teachers" className="ra-btn primary" confirm="Email a set-password link to every parent and teacher who hasn’t chosen a password yet?" />
        </section>
      )}
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
