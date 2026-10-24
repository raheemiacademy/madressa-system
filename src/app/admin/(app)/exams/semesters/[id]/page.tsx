import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PrintButton } from '@/components/PrintButton';
import { requireAdmin } from '@/server/next/actor';
import { semesterResults } from '@/server/learning/exams';

export const metadata = { title: 'Semester results' };

export default async function SemesterResults({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const r = Number.isInteger(id) ? await semesterResults(db, id) : null;
  if (!r) notFound();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{r.semester.title}</h1><p>All marks across the semester’s exams, as a percentage of the papers each student sat</p></div>
        <div className="ra-toolbar no-print"><PrintButton /><Link className="ra-btn" href="/admin/exams/semesters">Semesters</Link></div></div>
      <section className="ra-card" aria-label="Semester results">
        {r.rows.length === 0 ? <p className="ra-empty">No results yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Student</th><th className="num">Marks</th><th className="num">Out of</th><th className="num">%</th></tr></thead>
            <tbody>{r.rows.map((x) => <tr key={x.studentId}><td className="wrap">{x.name}</td><td className="num">{x.total / 10}</td><td className="num">{x.max / 10}</td><td className="num">{x.pct === null ? '' : `${x.pct}%`}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
