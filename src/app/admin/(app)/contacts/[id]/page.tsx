import { asc } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { CONTACT_TYPES, student } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { Check, SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { answersFor, answerText } from '@/server/people/custom-fields';
import { getContact } from '@/server/people/contacts';
import { linkContactAction, setBlockedAction, setLinkFlagsAction, unlinkContactAction } from '../../students/actions';
import { copyAddressAction, deleteContactAction } from '../actions';

export const metadata = { title: 'Contact' };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getContact(db, id) : null;
  if (!c) notFound();
  const [cf, students] = await Promise.all([
    answersFor(db, 'contact', id),
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).orderBy(asc(student.surname), asc(student.firstName))
  ]);
  const canEdit = adminCan(admin.staff, 'edit');
  const linked = new Set(c.students.map((s) => s.s.id));
  const blocked = c.login && !c.login.allowLogin;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{c.name}</h1><p>Contact #{c.id}{c.groups.length ? ` · ${c.groups.map((g) => g.name).join(', ')}` : ''}{!c.active ? ' · inactive' : ''}</p></div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href={`/admin/contacts/${id}/edit`}><Icon name="edit" />Edit</Link>}
          {canEdit && c.students.length > 0 && <ActionButton action={copyAddressAction.bind(null, id, undefined)} label="Sync address to all students" confirm={`Copy ${c.name}’s address to all ${c.students.length} linked students?`} />}
        </div></div>
      <div className="ra-grid">
        <section className="ra-card ra-c5" aria-labelledby="cd-h">
          <div className="ra-card-h"><div><h2 id="cd-h">Details</h2></div></div>
          <dl className="ra-dl">
            <dt>Email</dt><dd>{c.email ?? '—'}</dd><dt>Telephone</dt><dd>{c.tel ?? '—'}</dd>
            <dt>Mobile</dt><dd>{c.mobile ?? '—'}</dd><dt>Alt mobile</dt><dd>{c.altMobile ?? '—'}</dd>
            <dt>Address</dt><dd>{[c.address, c.postcode].filter(Boolean).join('\n') || '—'}</dd>
            <dt>Parent portal</dt><dd>{!c.login ? 'No login (add an email)' : blocked ? 'Blocked' : c.login.passwordHash ? `Can sign in${c.login.lastLoginAt ? `, last on ${formatInstant(c.login.lastLoginAt, 'dd/MM/yyyy')}` : ', never signed in'}` : 'No password set yet'}</dd>
            {cf.fields.map((f) => <span key={f.id} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{answerText(cf.values[f.id]) || '—'}</dd></span>)}
          </dl>
          {canEdit && c.login && <div className="ra-toolbar"><ActionButton action={setBlockedAction.bind(null, id, !blocked)} label={blocked ? 'Unblock portal' : 'Block portal'} confirm={blocked ? undefined : `Block ${c.name} from the parent portal?`} /></div>}
        </section>
        <section className="ra-card ra-c7" aria-labelledby="cs-h">
          <div className="ra-card-h"><div><h2 id="cs-h">Students</h2></div></div>
          {c.students.length === 0 ? <p className="ra-empty">Not linked to any students.</p> : (
            <div className="ra-table-wrap"><table className="ra-table">
              <thead><tr><th>Student</th><th>Type</th><th className="opt">Relation</th><th>Settings</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{c.students.map(({ s, link }) => (
                <tr key={s.id}>
                  <td className="wrap"><Link href={`/admin/students/${s.id}`}>{s.firstName} {s.surname}</Link> <span className="ra-muted">{s.status}</span></td>
                  <td>{link.type}</td><td className="opt">{link.relation ?? ''}</td>
                  <td className="wrap">{link.isPrimary && <Chip colour="var(--color-ok)">Primary</Chip>} {!link.portalAccess && <Chip colour="var(--color-fg-muted)">Hidden on portal</Chip>}</td>
                  <td>{canEdit && <span className="ra-toolbar" style={{ gap: 2 }}>
                    {!link.isPrimary && <ActionButton className="ra-link" action={setLinkFlagsAction.bind(null, s.id, id, { isPrimary: true })} label="Make primary" />}
                    <ActionButton className="ra-link" action={setLinkFlagsAction.bind(null, s.id, id, { portalAccess: !link.portalAccess })} label={link.portalAccess ? 'Block portal' : 'Allow portal'} />
                    <ActionButton className="ra-link" action={copyAddressAction.bind(null, id, s.id)} label="Set student address to this" />
                    <ActionButton className="ra-link" action={unlinkContactAction.bind(null, s.id, id)} label="Unlink" confirm="Unlink this student?" />
                  </span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
      {canEdit && (
        <Form action={linkContactAction} submit="Assign student" resetOnSuccess>
          <div className="ra-card-h"><div><h2>Assign a student</h2></div></div>
          <input type="hidden" name="contactId" value={id} />
          <div className="ra-fields">
            <SelectField name="studentId" label="Student" options={[{ value: '', label: 'Choose a student' }, ...students.filter((s) => !linked.has(s.id)).map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName} (#${s.id})` }))]} />
            <SelectField name="type" label="Type" options={CONTACT_TYPES.map((t) => ({ value: t, label: t }))} />
            <TextField name="relation" label="Relation" placeholder="e.g. Father" />
          </div>
          <div className="ra-checks"><Check name="isPrimary" label="Primary contact" /><Check name="portalAccess" label="Can see the child on the portal" defaultChecked /></div>
        </Form>
      )}
      {adminCan(admin.staff, 'delete') && (
        <section className="ra-card"><div className="ra-card-h"><div><h2>Delete contact</h2><div className="ra-note">Removes the contact and their portal login. Students are not deleted.</div></div>
          <ActionButton action={deleteContactAction.bind(null, id)} label="Delete contact" confirm={`Delete ${c.name}? This can’t be undone.`} danger /></div></section>
      )}
    </div>
  );
}
