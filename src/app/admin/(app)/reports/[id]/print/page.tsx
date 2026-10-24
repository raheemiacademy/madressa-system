import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { eotyReport } from '@/db/schema';
import { PrintButton } from '@/components/PrintButton';
import { pct1 } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { buildReport, termStudents } from '@/server/learning/eoty';
import { getProfile } from '@/server/profile';
import { yearAndClasses } from '../../../students/year-classes';

export const metadata = { title: 'Generate reports' };

/** §16 Generate Reports: one page per student (print, or Download PDF). */
export default async function Generate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string; student?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [r] = Number.isInteger(id) ? await db.select().from(eotyReport).where(eq(eotyReport.id, id)) : [];
  if (!r) notFound();
  const { options } = await yearAndClasses();
  const classId = Number(sp.class) || 0;
  const kids = classId ? (await termStudents(db, r, classId)).filter((k) => !sp.student || k.id === Number(sp.student)) : [];
  const [profile, reports] = await Promise.all([getProfile(db), Promise.all(kids.map((k) => buildReport(db, id, k.id, classId)))]);
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>{r.title}: generate reports</h1><p>Choose a class to see each student’s report, then print or download them as a PDF</p></div>
        <div className="ra-toolbar">{kids.length > 0 && <PrintButton />}<Link className="ra-btn" href={`/admin/reports/${id}`}>Report settings</Link></div></div>
      <form className="ra-card ra-toolbar no-print" role="search">
        <div className="ra-field"><label htmlFor="gr-class">Class</label><select className="ra-select" id="gr-class" name="class" defaultValue={String(classId || '')}><option value="">Choose a class</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <button className="ra-btn">Show reports</button>
      </form>
      {classId && kids.length === 0 ? <p className="ra-empty">No students were in this class during the term.</p> : null}
      {reports.map((x) => x && (
        <article key={x.student.id} className="ra-card ra-report ra-page-break" aria-label={`Report for ${x.student.firstName} ${x.student.surname}`}>
          <header><p className="ra-note" style={{ margin: 0 }}>{profile?.name}</p><h2 style={{ margin: '2px 0' }}>{x.student.firstName} {x.student.surname}</h2>
            <p className="ra-note" style={{ margin: 0 }}>{x.className} · {r.title} · {formatCalendarDate(r.termStart)} to {formatCalendarDate(r.termEnd)}</p></header>
          {x.scored.length > 0 && (
            <section aria-label="Scores"><table className="ra-table"><tbody>{x.scored.map((q) => (
              <tr key={q.question}><th scope="row" style={{ width: '22%', textAlign: 'left' }}>{q.question}</th><td style={{ width: '18%' }}>{q.label || '—'}</td><td className="wrap">{q.paragraph}</td></tr>
            ))}</tbody></table></section>
          )}
          {x.exams.length > 0 && x.exams.map((e) => (
            <section key={e.title} aria-label={e.title}><h3 style={{ fontSize: 14, margin: '8px 0 4px' }}>{e.title}{e.grade ? ` · ${e.grade}` : ''}{e.pct !== null ? ` · ${e.pct}%` : ''}{e.position ? ` · position ${e.position}` : ''}</h3>
              <table className="ra-table"><tbody>{e.papers.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num">{p.mark} / {p.max}</td></tr>)}</tbody></table></section>
          ))}
          {x.semesterPct !== null && <p style={{ margin: 0 }}>Semester result: <b>{x.semesterPct}%</b></p>}
          <dl className="ra-dl">
            {x.attendance && <><dt>Attendance</dt><dd>{pct1(x.attendance.standardPct)} over {x.attendance.sessions === 1 ? '1 session' : `${x.attendance.sessions} sessions`} ({x.attendance.late} late)</dd></>}
            {x.homework && <><dt>Homework</dt><dd>{x.homework.total ? `${x.homework.completed} of ${x.homework.total} completed` : 'None set this term'}</dd></>}
          </dl>
          {x.incidents.length > 0 && <section aria-label="Incidents"><h3 style={{ fontSize: 14, margin: '8px 0 4px' }}>Incidents</h3><ul className="ra-list">{x.incidents.map((i, n) => <li key={n}>{i.when}: {i.title} ({i.severity})</li>)}</ul></section>}
          <section aria-label="Teacher’s comment"><h3 style={{ fontSize: 14, margin: '8px 0 4px' }}>Teacher’s comment</h3><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{x.comment || <span className="ra-muted">No comment written yet.</span>}</p>
            {x.writtenBy && <p className="ra-note" style={{ margin: '4px 0 0' }}>{x.writtenBy}</p>}</section>
        </article>
      ))}
    </div>
  );
}
