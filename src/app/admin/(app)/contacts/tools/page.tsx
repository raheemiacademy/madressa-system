import { asc } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { CONTACT_TYPES, contact } from '@/db/schema';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { conflicts, contactsWithoutStudents, duplicateAssignments, studentsWithoutContacts } from '@/server/people/contacts';
import { massAssignAction } from '../actions';

export const metadata = { title: 'Contact tools' };

const TOOLS = [['email', 'Email conflicts'], ['mobile', 'Mobile conflicts'], ['duplicates', 'Multiple contact assignments'], ['no-contacts', 'Students with no contacts'], ['no-students', 'Contacts with no students'], ['mass', 'Mass-assign contacts']] as const;

export default async function ContactTools({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const admin = await requireAdmin();
  const wanted = (await searchParams).tool;
  const tool = TOOLS.find(([k]) => k === wanted)?.[0] ?? 'email';
  let body: React.ReactNode = null;
  if (tool === 'email' || tool === 'mobile') {
    const rows = await conflicts(db, tool);
    body = rows.length === 0 ? <p className="ra-empty">No two contacts share {tool === 'email' ? 'an email address' : 'a mobile number'}.</p> : (
      <table className="ra-table"><thead><tr><th>{tool === 'email' ? 'Email' : 'Mobile'}</th><th>Contacts</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.value}><td className="wrap">{r.value}</td><td className="wrap">{r.ids.map((id, i) => <span key={id}>{i ? ', ' : ''}<Link href={`/admin/contacts/${id}`}>{r.names[i]}</Link></span>)}</td></tr>)}</tbody></table>
    );
  } else if (tool === 'duplicates') {
    const rows = await duplicateAssignments(db);
    body = rows.length === 0 ? <p className="ra-empty">No student has two contacts with the same name.</p> : (
      <table className="ra-table"><thead><tr><th>Student</th><th>Contact name</th><th>Records</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={`${r.student_id}-${r.name}`}><td className="wrap"><Link href={`/admin/students/${r.student_id}`}>{r.student}</Link></td><td className="wrap">{r.name}</td>
          <td className="wrap">{r.contact_ids.map((id, i) => <span key={id}>{i ? ', ' : ''}<Link href={`/admin/contacts/${id}`}>#{id}</Link></span>)} <span className="ra-note">Unlink the extra from the contact page.</span></td></tr>)}</tbody></table>
    );
  } else if (tool === 'no-contacts') {
    const rows = await studentsWithoutContacts(db);
    body = rows.length === 0 ? <p className="ra-empty">Every student has at least one contact.</p>
      : <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r) => <li key={r.id}><Link href={`/admin/students/${r.id}/edit`}>{r.firstName} {r.surname}</Link> <span className="ra-muted">({r.status})</span></li>)}</ul>;
  } else if (tool === 'no-students') {
    const rows = await contactsWithoutStudents(db);
    body = rows.length === 0 ? <p className="ra-empty">Every contact is linked to a student.</p>
      : <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r) => <li key={r.id}><Link href={`/admin/contacts/${r.id}`}>{r.name}</Link> <span className="ra-muted">{r.email ?? ''}</span></li>)}</ul>;
  } else if (adminCan(admin.staff, 'edit')) {
    const all = await db.select({ id: contact.id, name: contact.name }).from(contact).orderBy(asc(contact.name));
    body = (
      <Form action={massAssignAction} card={false} submit="Apply to chosen contacts">
        <p className="ra-note" style={{ margin: 0 }}>Changes every student link of the chosen contacts. Leave a setting blank to keep it.</p>
        <div className="ra-fields">
          <SelectField name="type" label="Type" options={[{ value: '', label: 'Keep' }, ...CONTACT_TYPES.map((t) => ({ value: t, label: t }))]} />
          <TextField name="relation" label="Relation" placeholder="Keep" />
          <SelectField name="isPrimary" label="Primary" options={[{ value: '', label: 'Keep' }, { value: 'yes', label: 'Make primary' }, { value: 'no', label: 'Not primary' }]} />
          <SelectField name="portalAccess" label="Portal access" options={[{ value: '', label: 'Keep' }, { value: 'yes', label: 'Allow' }, { value: 'no', label: 'Block' }]} />
        </div>
        <Checks name="contactIds" legend={`Contacts (${plural(all.length, 'contact')})`} options={all.map((c) => ({ value: String(c.id), label: c.name }))} />
      </Form>
    );
  } else body = <p className="ra-empty">You need the Can edit access level for this.</p>;

  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Contact tools</h1><p>Find and fix problems in contact records.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/students/portal-access">Portal access overview</Link><Link className="ra-btn" href="/admin/settings/parentPortal">Block by contact type</Link></div></div>
      <nav className="ra-filters" aria-label="Tools">{TOOLS.map(([k, l]) => <Link key={k} className="ra-filter" href={`?tool=${k}`} aria-current={tool === k ? 'page' : undefined}>{l}</Link>)}</nav>
      <section className="ra-card">{body}</section>
    </div>
  );
}
