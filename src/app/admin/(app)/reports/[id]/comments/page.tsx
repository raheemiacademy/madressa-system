import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { entriesFor } from '@/server/learning/eoty';
import { yearAndClasses } from '../../../students/year-classes';
import { entriesAction } from '../../actions';

export const metadata = { title: 'Report comments' };

/** Scores and a comment per student in one class. Teachers do the same in the teacher portal (Phase 8). */
export default async function Comments({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const { options } = await yearAndClasses();
  const classId = Number((await searchParams).class) || Number(options[0]?.value) || 0;
  const data = Number.isInteger(id) && classId ? await entriesFor(db, id, classId) : null;
  if (Number.isInteger(id) && !data && classId) notFound();
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{data?.report.title ?? 'Report'}: comments</h1><p>Scores and comments for each student in the class</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/reports/${id}`}>Report settings</Link></div></div>
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field"><label htmlFor="rc-class">Class</label><select className="ra-select" id="rc-class" name="class" defaultValue={String(classId)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <button className="ra-btn">Show</button>
      </form>
      {!data ? <p className="ra-empty">No classes set up for this year yet.</p> : data.students.length === 0 ? <p className="ra-empty">No students were in this class during the term.</p> : (
        <Form action={entriesAction.bind(null, id)} submit="Save comments">
          {data.students.map((s) => (
            <fieldset key={s.id} className="ra-fieldset">
              <legend>{s.firstName} {s.surname}</legend>
              <input type="hidden" name="studentIds" value={s.id} />
              {data.report.scoring && (
                <div className="ra-fields">{data.report.questions.map((q, i) => (
                  <div key={q} className="ra-field"><label htmlFor={`sc-${s.id}-${i}`}>{q}</label>
                    <select className="ra-select" id={`sc-${s.id}-${i}`} name={`score.${s.id}.${i}`} defaultValue={String(s.entry?.scores[i] ?? 0)} disabled={!canEdit}>
                      <option value="0">Not scored</option>{data.report.scoreLabels.map((l, n) => <option key={l} value={n + 1}>{l}</option>)}
                    </select></div>
                ))}</div>
              )}
              <div className="ra-field"><label htmlFor={`cm-${s.id}`}>Comment</label>
                <textarea className="ra-textarea" id={`cm-${s.id}`} name={`comment.${s.id}`} rows={3} defaultValue={s.entry?.comment ?? ''} disabled={!canEdit} /></div>
              {s.entry?.writtenBy && <p className="ra-note" style={{ margin: 0 }}>Last written by {s.entry.writtenBy}</p>}
            </fieldset>
          ))}
        </Form>
      )}
    </div>
  );
}
