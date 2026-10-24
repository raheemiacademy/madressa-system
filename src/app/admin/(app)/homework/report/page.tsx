import Link from 'next/link';
import { db } from '@/db';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { yearReport } from '@/server/learning/homework';
import { yearAndClasses } from '../../students/year-classes';
import { yearReportAction } from '../actions';

export const metadata = { title: 'Homework year report' };

export default async function YearReport({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { year, options } = await yearAndClasses();
  const rows = year ? await yearReport(db, year.id, Number(sp.class) || undefined) : [];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Homework year report</h1><p>Each student’s homework{year ? ` in ${year.title}` : ''}: set, completed and not completed</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/settings/templates/homework.year-report">Edit email</Link><Link className="ra-btn" href="/admin/homework">Homework</Link></div></div>
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field"><label htmlFor="yr-class">Class</label><select className="ra-select" id="yr-class" name="class" defaultValue={sp.class ?? ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <button className="ra-btn">Show</button>
      </form>
      <section className="ra-card" aria-label="Year report">
        {rows.length === 0 ? <p className="ra-empty">No homework set this year yet.</p> : (
          <Form action={yearReportAction} card={false} savebar={false} submit="Email contacts">
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 600 }}><table className="ra-table">
              <thead><tr><th><span className="sr-only">Select</span></th><th>Student</th><th className="num">Total</th><th className="num">Completed</th><th className="num">Incomplete</th><th className="num">%</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.studentId}><td><input type="checkbox" name="studentIds" value={r.studentId} aria-label={`Email ${r.firstName} ${r.surname}’s contacts`} /></td>
                  <td className="wrap">{r.firstName} {r.surname}</td><td className="num">{r.total}</td><td className="num">{r.completed}</td><td className="num">{r.incomplete}</td><td className="num">{r.pct === null ? '—' : `${r.pct}%`}</td></tr>
              ))}</tbody>
            </table></div>
          </Form>
        )}
      </section>
    </div>
  );
}
