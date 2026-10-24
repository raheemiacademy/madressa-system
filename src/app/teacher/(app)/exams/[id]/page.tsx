import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { examResults, showMark } from '@/server/learning/exams';
import { requireTeacher } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { paperAction, resultsAction } from '../../actions';

export const metadata = { title: 'Exam' };

/** One exam for a teacher's class: add papers and enter marks while it's open. Closed or locked exams are read-only here. */
export default async function TeacherExam({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await examResults(db, id) : null;
  if (!data || !t.ctx.classes.some((c) => c.id === data.exam.classId) || !shows(t.ctx, data.exam.official ? 'Exams' : 'Progressive Tests')) notFound();
  const open = data.exam.status === 'open';
  return (
    <>
      <PortalHead title={data.exam.title} kicker={`${data.className} · ${formatCalendarDate(data.exam.date)}${open ? '' : ` · ${data.exam.status}`}`} back="/teacher/exams" />
      <main className="rp-main">
        {!open && <p className="rp-empty">This exam is {data.exam.status}. Ask the office to reopen it to change marks.</p>}
        {!data.tests.length ? <p className="rp-empty">No papers yet. Add one below.</p> : (
          <Form action={resultsAction.bind(null, id)} submit="Save results" savebar={false}>
            <p className="ra-note" style={{ margin: 0 }}>Type a mark, “abs” for absent, or leave blank.</p>
            <div className="ra-table-wrap">
              <table className="ra-table">
                <thead><tr><th>Student</th>{data.tests.map((x) => <th key={x.t.id} className="num">{x.t.name}<br /><span className="ra-muted">/ {x.t.maxMarks}</span></th>)}<th className="num">Total</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.student.id}>
                      <td className="wrap">{r.student.firstName} {r.student.surname}</td>
                      {data.tests.map((x) => { const m = r.marks[x.t.id]!; return <td key={x.t.id} className="num"><input className="ra-input" style={{ width: 72, textAlign: 'right' }} name={`${x.t.id}:${r.student.id}`} inputMode="decimal" disabled={!open} aria-label={`${x.t.name}, ${r.student.firstName} ${r.student.surname}`} defaultValue={m.absent ? 'abs' : m.tenths === null ? '' : showMark(m.tenths)} /></td>; })}
                      <td className="num">{r.pct === null ? '—' : `${r.pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Form>
        )}
        {open && (
          <Form action={paperAction.bind(null, id)} submit="Add paper" savebar={false} resetOnSuccess>
            <div className="ra-fields"><TextField name="name" label="Paper" autoComplete="off" /><TextField name="maxMarks" label="Out of" inputMode="numeric" defaultValue="100" /></div>
          </Form>
        )}
      </main>
    </>
  );
}
