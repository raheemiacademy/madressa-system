import Link from 'next/link';
import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { consentsForClass } from '@/server/people/extras';
import { setConsentAction } from '../actions';
import { yearAndClasses } from '../year-classes';

export const metadata = { title: 'Walk-home consents' };

export default async function WalkHome({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const admin = await requireAdmin();
  const { options } = await yearAndClasses();
  const classId = Number((await searchParams).class) || Number(options[0]?.value) || null;
  const rows = classId ? await consentsForClass(db, classId) : [];
  const given = rows.filter((r) => r.givenAt).length;
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Walk-home consents</h1><p>Consents parents give on the portal, or staff record by hand.</p></div>
        <div className="ra-toolbar">{classId && <a className="ra-btn" href={`/admin/students/walk-home/export?class=${classId}`}>Download CSV</a>}</div></div>
      <nav className="ra-filters" aria-label="Class">
        {options.map((o) => <Link key={o.value} className="ra-filter" href={`?class=${o.value}`} aria-current={String(classId) === o.value ? 'page' : undefined}>{o.label}</Link>)}
      </nav>
      <section className="ra-card">
        {options.length === 0 ? <p className="ra-empty">No classes this year yet.</p> : rows.length === 0 ? <p className="ra-empty">No current students in this class.</p> : (
          <>
            <div className="ra-note" role="status">{given} of {rows.length} have consent.</div>
            <div className="ra-table-wrap"><table className="ra-table">
              <thead><tr><th>Student</th><th>Consent</th><th className="opt">Given by</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="wrap"><Link href={`/admin/students/${r.id}`}>{r.firstName} {r.surname}</Link></td>
                  <td>{r.givenAt ? `Yes, ${formatInstant(r.givenAt, 'dd/MM/yyyy')}` : <span className="ra-muted">No</span>}</td>
                  <td className="opt wrap">{r.givenAt ? (r.source === 'portal' ? r.by ?? 'Parent portal' : 'Recorded by staff') : ''}</td>
                  <td>{canEdit && <ActionButton className="ra-link" action={setConsentAction.bind(null, r.id, !r.givenAt)} label={r.givenAt ? 'Remove' : 'Add consent'} confirm={r.givenAt ? 'Remove this consent?' : undefined} />}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </section>
    </div>
  );
}
