import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Form } from '@/components/Form';
import { ReportCard } from '@/components/ReportCard';
import { buildReport, entriesFor } from '@/server/learning/eoty';
import { requireTeacher } from '@/server/next/portal';
import { classesWith } from '@/server/portal/access';
import { getProfile } from '@/server/profile';
import { commentsAction } from '../../actions';

export const metadata = { title: 'Report comments' };

/** Comments and scores for one class on one report. With "teachers can preview", the finished reports show underneath. */
export default async function Comments({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string }> }) {
  const t = await requireTeacher('EOTY Reports');
  const id = Number((await params).id);
  const classId = Number((await searchParams).class);
  const cls = classesWith(t.ctx, 'canEoty').find((c) => c.id === classId);
  const data = cls && Number.isInteger(id) ? await entriesFor(db, id, cls.id) : null;
  if (!cls || !data || !data.report.active) notFound();
  const r = data.report;
  const [previews, profile] = r.teachersCanDownload ? await Promise.all([Promise.all(data.students.map((s) => buildReport(db, id, s.id, cls.id))), getProfile(db)]) : [[], null];
  return (
    <>
      <PortalHead title={r.title} kicker={cls.name} back="/teacher/reports" />
      <main className="rp-main">
        {!data.students.length ? <p className="rp-empty">No students were in this class during the term.</p> : (
          <Form action={commentsAction.bind(null, id, cls.id)} submit="Save comments" savebar={false}>
            {data.students.map((s) => (
              <fieldset key={s.id} className="ra-fieldset">
                <legend>{s.firstName} {s.surname}</legend>
                {r.scoring && (
                  <div className="ra-fields">
                    {r.questions.map((q, i) => (
                      <div key={q} className="ra-field"><label htmlFor={`sc-${s.id}-${i}`}>{q}</label>
                        <select className="ra-select" id={`sc-${s.id}-${i}`} name={`score.${s.id}.${i}`} defaultValue={String(s.entry?.scores[i] ?? 0)}>
                          <option value="0">Not scored</option>{r.scoreLabels.map((l, n) => <option key={l} value={n + 1}>{l}</option>)}
                        </select></div>
                    ))}
                  </div>
                )}
                <div className="ra-field"><label htmlFor={`cm-${s.id}`}>Comment</label><textarea className="ra-textarea" id={`cm-${s.id}`} name={`comment.${s.id}`} rows={3} defaultValue={s.entry?.comment ?? ''} maxLength={5000} /></div>
              </fieldset>
            ))}
          </Form>
        )}
        {previews.length > 0 && <><h2>Preview</h2>{previews.map((x) => x && <ReportCard key={x.student.id} x={x} school={profile?.name} />)}</>}
      </main>
    </>
  );
}
