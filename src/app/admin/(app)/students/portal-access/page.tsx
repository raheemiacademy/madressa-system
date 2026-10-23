import { and, asc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { contact, loginIdentity, student, studentContact } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { ActionButton } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { readTab } from '@/server/settings';
import { setBlockedAction, setLinkFlagsAction } from '../actions';

export const metadata = { title: 'Parent portal access' };

export default async function PortalAccess({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  const status = (await searchParams).status === 'all' ? null : 'Current';
  const [settings, rows] = await Promise.all([
    readTab(db, 'parentPortal'),
    db.select({ s: { id: student.id, firstName: student.firstName, surname: student.surname }, c: { id: contact.id, name: contact.name, email: contact.email }, link: studentContact, login: { allowLogin: loginIdentity.allowLogin, hasPassword: loginIdentity.passwordHash } })
      .from(studentContact).innerJoin(student, eq(student.id, studentContact.studentId)).innerJoin(contact, eq(contact.id, studentContact.contactId))
      .leftJoin(loginIdentity, eq(loginIdentity.contactId, contact.id))
      .where(and(status ? eq(student.status, status) : undefined, inArray(studentContact.type, ['Parent', 'Sibling', 'Emergency', 'Other'])))
      .orderBy(asc(student.surname), asc(student.firstName), asc(studentContact.sortOrder))
  ]);
  const allowedTypes = (settings.contactTypesAllowed as string[]) ?? ['Parent'];
  const canEdit = adminCan(admin.staff, 'edit');
  const byStudent = new Map<number, typeof rows>();
  for (const r of rows) byStudent.set(r.s.id, [...(byStudent.get(r.s.id) ?? []), r]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Parent portal access</h1><p>Who can see each child on the parent portal.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/settings/parentPortal">Portal settings</Link></div></div>
      <div className="ra-banner" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div>
        The portal is {settings.disabled ? <b>turned off</b> : <b>on</b>}. Contact types allowed: <b>{allowedTypes.join(', ') || 'none'}</b>.
        A contact with no email can’t sign in; add one on their contact page.
      </div></div>
      <nav className="ra-filters" aria-label="Students to show">
        <Link className="ra-filter" href="?" aria-current={status ? 'page' : undefined}>Current students</Link>
        <Link className="ra-filter" href="?status=all" aria-current={!status ? 'page' : undefined}>All students</Link>
      </nav>
      <section className="ra-card">
        {byStudent.size === 0 ? <p className="ra-empty">No students with contacts yet.</p> : (
          <div className="ra-table-wrap" style={{ maxHeight: 700 }}><table className="ra-table">
            <thead><tr><th>Student</th><th>Contact</th><th className="opt">Type</th><th>Portal</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{[...byStudent.values()].flatMap((list) => list.map((r, i) => {
              const typeOk = allowedTypes.includes(r.link.type);
              const blocked = r.login && !r.login.allowLogin;
              const state = !r.c.email ? 'No email' : blocked ? 'Blocked' : !typeOk ? 'Type not allowed' : !r.link.portalAccess ? 'Child hidden' : r.login?.hasPassword ? 'Can sign in' : 'No password yet';
              return (
                <tr key={`${r.s.id}-${r.c.id}`}>
                  <td className="wrap">{i === 0 ? <Link href={`/admin/students/${r.s.id}`}>{r.s.firstName} {r.s.surname}</Link> : ''}</td>
                  <td className="wrap"><Link href={`/admin/contacts/${r.c.id}`}>{r.c.name}</Link>{r.link.isPrimary && <> <Chip colour="var(--color-ok)">Primary</Chip></>}<div className="ra-note">{r.c.email ?? ''}</div></td>
                  <td className="opt">{r.link.type}</td>
                  <td><Chip colour={state === 'Can sign in' ? 'var(--color-ok)' : state === 'Blocked' ? 'var(--color-bad)' : 'var(--color-fg-muted)'}>{state}</Chip></td>
                  <td>{canEdit && <span className="ra-toolbar" style={{ gap: 2 }}>
                    <ActionButton className="ra-link" action={setLinkFlagsAction.bind(null, r.s.id, r.c.id, { portalAccess: !r.link.portalAccess })} label={r.link.portalAccess ? 'Hide child' : 'Show child'} />
                    {!r.link.isPrimary && <ActionButton className="ra-link" action={setLinkFlagsAction.bind(null, r.s.id, r.c.id, { isPrimary: true })} label="Make primary" />}
                    {r.login && <ActionButton className="ra-link" action={setBlockedAction.bind(null, r.c.id, !blocked)} label={blocked ? 'Unblock' : 'Block'} confirm={blocked ? undefined : `Block ${r.c.name} from the parent portal? They will be signed out.`} />}
                  </span>}</td>
                </tr>
              );
            }))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
