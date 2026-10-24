import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { showMark } from '@/server/learning/exams';
import { requireParent } from '@/server/next/portal';
import { childResults } from '@/server/portal/parent';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Exam results' };

/** §15/§20 Results of exams and progressive tests once marking is finished (closed or locked). */
export default async function Results({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Exam Results');
  const kid = pickKid(p, (await searchParams).child);
  const results = kid ? await childResults(db, kid) : [];
  return (
    <>
      <PortalHead title="Exam results" back="/parent/more" kicker={kid?.label} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/results" />
            {!results.length && <p className="rp-empty">No results yet. They appear once the teacher has finished marking.</p>}
            {results.map(({ exam, tests, row }) => (
              <section key={exam.id} className="ra-card" aria-labelledby={`ex-${exam.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <h2 id={`ex-${exam.id}`} style={{ margin: 0, fontSize: 17 }}>{exam.title}</h2>
                  <b>{row.pct === null ? '—' : `${row.pct}%`}{row.grade ? ` · ${row.grade}` : ''}</b>
                </div>
                <p className="ra-note" style={{ margin: '2px 0 8px' }}>{exam.official ? 'Exam' : 'Progressive test'} · {formatCalendarDate(exam.date)}</p>
                <table className="ra-table"><tbody>{tests.map((t) => { const m = row.marks[t.t.id]!; return <tr key={t.t.id}><td className="wrap">{t.t.name}</td><td className="num">{m.absent ? 'Absent' : m.tenths === null ? '—' : `${showMark(m.tenths)} / ${t.t.maxMarks}`}</td></tr>; })}</tbody></table>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
