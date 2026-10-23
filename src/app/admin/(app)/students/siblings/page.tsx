import { asc } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { student } from '@/db/schema';
import { SelectField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { findSiblings, listSiblings } from '@/server/people/siblings';
import { addSiblingAction, autoSiblingsAction, removeSiblingAction } from '../actions';

export const metadata = { title: 'Siblings' };

export default async function Siblings({ searchParams }: { searchParams: Promise<{ surname?: string; all?: string; check?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const includeAll = sp.all === '1';
  const surname = (sp.surname ?? '').trim().slice(0, 60);
  const [rows, found, students] = await Promise.all([
    listSiblings(db, { surname, includeAll }),
    sp.check === '1' ? findSiblings(db, includeAll) : Promise.resolve(null),
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).orderBy(asc(student.surname), asc(student.firstName))
  ]);
  const canEdit = adminCan(admin.staff, 'edit');
  const opts = students.filter((s) => includeAll || s.status === 'Current').map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName} (#${s.id})` }));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Siblings</h1><p>Registered sibling relations, used for sibling discounts and combined fees.</p></div>
        <div className="ra-toolbar">{canEdit && <ActionButton className="ra-btn primary" action={autoSiblingsAction.bind(null, includeAll)} label="Automatically find siblings" />}</div></div>
      <form className="ra-card ra-toolbar" action="/admin/students/siblings">
        <div className="ra-field"><label htmlFor="sn">Find by surname</label><input className="ra-input" id="sn" name="surname" defaultValue={surname} /></div>
        <label className="ra-check" style={{ alignSelf: 'end' }}><input type="checkbox" name="all" value="1" defaultChecked={includeAll} /><span>Include students who aren’t current</span></label>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Show</button>
        <button className="ra-btn" name="check" value="1" style={{ alignSelf: 'end' }}>Quick check</button>
      </form>
      {found && (
        <section className="ra-card" aria-labelledby="qc-h">
          <div className="ra-card-h"><div><h2 id="qc-h">Quick check</h2><div className="ra-note">Students who share a Parent contact but aren’t registered as siblings yet.</div></div></div>
          {found.length === 0 ? <p className="ra-empty">Nothing to add: every family is already registered.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>{found.map((f) => <li key={`${f.a}-${f.b}`}>{f.a_name} and {f.b_name} <span className="ra-muted">(share {f.contact})</span></li>)}</ul>
          )}
        </section>
      )}
      <section className="ra-card" aria-labelledby="sl-h">
        <div className="ra-card-h"><div><h2 id="sl-h">Sibling relations</h2><div className="ra-note">{plural(rows.length, 'relation')}</div></div>
          <div className="ra-toolbar"><Link className="ra-link" href="/admin/students">Students</Link></div></div>
        {rows.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
          <div className="ra-table-wrap"><table className="ra-table">
            <thead><tr><th>Student</th><th>Sibling</th><th className="opt">Added</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={`${r.a}-${r.b}`}>
                <td className="wrap"><Link href={`/admin/students/${r.a}`}>{r.a_name}</Link> <span className="ra-muted">{r.a_status}</span></td>
                <td className="wrap"><Link href={`/admin/students/${r.b}`}>{r.b_name}</Link> <span className="ra-muted">{r.b_status}</span></td>
                <td className="opt">{r.source === 'auto' ? 'Found automatically' : 'By hand'}</td>
                <td>{canEdit && <span className="ra-acts"><ActionButton className="" ariaLabel={`Remove ${r.a_name} and ${r.b_name}`} action={removeSiblingAction.bind(null, r.a, r.b)} confirm="Remove this sibling relation?"><Icon name="trash" /></ActionButton></span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {canEdit && (
        <Form action={addSiblingAction} submit="Add relation" resetOnSuccess>
          <div className="ra-card-h"><div><h2>Add siblings by hand</h2></div></div>
          <div className="ra-fields">
            <SelectField name="a" label="Student" options={[{ value: '', label: 'Choose a student' }, ...opts]} />
            <SelectField name="b" label="Sibling" options={[{ value: '', label: 'Choose a student' }, ...opts]} />
          </div>
        </Form>
      )}
    </div>
  );
}
