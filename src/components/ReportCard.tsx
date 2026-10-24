import { pct1 } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import type { buildReport } from '@/server/learning/eoty';

/** §16 One student's end-of-term report, as printed by the office and shown on the portals. */
export function ReportCard({ x, school }: { x: NonNullable<Awaited<ReturnType<typeof buildReport>>>; school?: string | null }) {
  const r = x.report;
  return (
    <article className="ra-card ra-report ra-page-break" aria-label={`Report for ${x.student.firstName} ${x.student.surname}`}>
      <header><p className="ra-note" style={{ margin: 0 }}>{school}</p><h2 style={{ margin: '2px 0' }}>{x.student.firstName} {x.student.surname}</h2>
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
  );
}
