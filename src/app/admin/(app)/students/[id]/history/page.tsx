import { asc, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { academicYear, schoolClass } from '@/db/schema';
import { SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { getStudent } from '@/server/people/students';
import { addHistoryAction, deleteHistoryAction } from '../../actions';

export const metadata = { title: 'Class history' };

export default async function ClassHistory({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await getStudent(db, id) : null;
  if (!s) notFound();
  const [years, classes] = await Promise.all([
    db.select().from(academicYear),
    db.select({ id: schoolClass.id, name: schoolClass.name, year: academicYear.title }).from(schoolClass).innerJoin(academicYear, eq(academicYear.id, schoolClass.academicYearId)).orderBy(desc(academicYear.startsOn), asc(schoolClass.name))
  ]);
  const yearOf = (yid: number) => years.find((y) => y.id === yid)?.title ?? '';
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Class history</h1><p><Link href={`/admin/students/${id}`}>{s.firstName} {s.surname}</Link> · #{s.id}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/students/move">Move to a new class</Link></div></div>
      <section className="ra-card" aria-labelledby="h-h">
        <div className="ra-card-h"><div><h2 id="h-h">Classes</h2><div className="ra-note">An entry with no “To” date is a current class.</div></div></div>
        {s.classes.length === 0 ? <p className="ra-empty">No class history yet.</p> : (
          <div className="ra-table-wrap"><table className="ra-table">
            <thead><tr><th>From</th><th>To</th><th>Class</th><th>Year</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{s.classes.map(({ a, c }) => (
              <tr key={a.id}>
                <td>{formatCalendarDate(a.fromDate)}</td><td>{a.toDate ? formatCalendarDate(a.toDate) : <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-ok)' }}><span>Current</span></span>}</td>
                <td className="wrap">{c.name}</td><td>{yearOf(c.academicYearId)}</td>
                <td>{adminCan(admin.staff, 'delete') && <span className="ra-acts"><ActionButton className="" ariaLabel={`Delete the ${c.name} entry`} action={deleteHistoryAction.bind(null, a.id)} confirm="Delete this class history entry?"><Icon name="trash" /></ActionButton></span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {adminCan(admin.staff, 'edit') && (
        <Form action={addHistoryAction.bind(null, id)} submit="Add to history" resetOnSuccess>
          <div className="ra-card-h"><div><h2>Add a class to the history</h2><div className="ra-note">Leave “To” blank to make it a current class (assign the current class).</div></div></div>
          <div className="ra-fields">
            <SelectField name="classId" label="Class" options={[{ value: '', label: 'Choose a class' }, ...classes.map((c) => ({ value: String(c.id), label: `${c.name} (${c.year})` }))]} />
            <TextField name="fromDate" label="From" type="date" />
            <TextField name="toDate" label="To" type="date" />
          </div>
        </Form>
      )}
    </div>
  );
}
