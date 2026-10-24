import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Form } from '@/components/Form';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { examResults, showMark } from '@/server/learning/exams';
import { resultsAction } from '../../actions';

export const metadata = { title: 'Exam results' };

/** Results entry: one box per paper and student (marks, half marks like 45.5, or "abs"), with totals, %, grade and position. */
export default async function Results({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await examResults(db, id) : null;
  if (!data) notFound();
  const canEdit = adminCan(admin.staff, 'edit') && data.exam.status !== 'locked';
  const table = (
    <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
      <thead><tr><th>Student</th>{data.tests.map((t) => <th key={t.t.id} className="num">{t.t.name}<div className="ra-note">/ {t.t.maxMarks}</div></th>)}<th className="num">Total</th><th className="num">%</th><th>Grade</th><th className="num">Position</th></tr></thead>
      <tbody>{data.rows.map((r) => (
        <tr key={r.student.id}><td className="wrap">{r.student.firstName} {r.student.surname}</td>
          {data.tests.map((t) => { const m = r.marks[t.t.id]!; return (
            <td key={t.t.id} className="num">{canEdit
              ? <input className="ra-input" name={`${t.t.id}:${r.student.id}`} defaultValue={showMark(m.tenths, m.absent)} inputMode="decimal" aria-label={`${r.student.firstName} ${r.student.surname}, ${t.t.name}`} style={{ width: 72, textAlign: 'right' }} />
              : showMark(m.tenths, m.absent)}</td>
          ); })}
          <td className="num">{showMark(r.total)}</td><td className="num">{r.pct === null ? '' : `${r.pct}%`}</td><td>{r.grade}</td><td className="num">{r.position || ''}</td></tr>
      ))}</tbody>
    </table></div>
  );
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{data.exam.title}: results</h1><p>{data.className} · {formatCalendarDate(data.exam.date)} · {data.exam.status}</p></div>
        <div className="ra-toolbar no-print"><PrintButton /><Link className="ra-btn" href={`/admin/exams/${id}`}>Exam and papers</Link></div></div>
      <section className="ra-card" aria-label="Results">
        {data.tests.length === 0 ? <p className="ra-empty">Add papers to this exam first.</p> : data.rows.length === 0 ? <p className="ra-empty">This class had no students on the exam date.</p>
          : canEdit ? <Form action={resultsAction.bind(null, id)} card={false} submit="Save results"><p className="ra-note" style={{ margin: 0 }}>Type a mark, “abs” for absent, or leave blank.</p>{table}</Form> : table}
      </section>
    </div>
  );
}
