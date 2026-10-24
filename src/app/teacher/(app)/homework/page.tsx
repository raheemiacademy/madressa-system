import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Check, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { classesWith } from '@/server/portal/access';
import { addDays } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';
import { myHomework } from '@/server/portal/teacher';
import { homeworkAction } from '../actions';

export const metadata = { title: 'Homework' };

/** §13/§20 Set homework (design: TeacherHomework) for classes with the Homework privilege, and see how much has been handed in. */
export default async function Homework() {
  const t = await requireTeacher('Homework');
  const classes = classesWith(t.ctx, 'canHomework');
  const recent = await myHomework(db, t.ctx);
  return (
    <>
      <PortalHead title="Homework" />
      <main className="rp-main">
        {!classes.length ? <p className="rp-empty">You don’t have the Homework privilege for any class. The office can turn it on.</p> : (
          <Form action={homeworkAction} submit="Set homework" savebar={false} resetOnSuccess>
            <h2 style={{ margin: 0 }}>Set homework</h2>
            <div className="ra-fields">
              <SelectField name="classId" label="Class" full options={classes.map((c) => ({ value: String(c.id), label: c.name }))} />
              <TextField name="title" label="Title" full enterKeyHint="next" autoComplete="off" />
              <TextArea name="instructions" label="Instructions" rows={4} />
              <TextField name="dueDate" label="Due date" type="date" defaultValue={addDays(todayIso(), 7)} />
              <TextField name="dueTime" label="Due time" type="time" defaultValue="17:00" />
            </div>
            <div className="ra-checks">
              <Check name="allowUploads" label="Parents can upload files (photos, audio or PDFs)" defaultChecked />
              <Check name="notifyContacts" label="Notify parents now" defaultChecked />
              <Check name="lockAfterDeadline" label="Lock after the deadline" />
            </div>
          </Form>
        )}
        <h2>Recent</h2>
        {!recent.length ? <p className="rp-empty">No homework set yet.</p> : (
          <ul className="rp-list">
            {recent.map((r) => {
              const pct = r.total ? Math.round((r.completed / r.total) * 100) : 0;
              return (
                <li key={r.h.id}><Link className="tap" href={`/teacher/homework/${r.h.id}`} style={{ display: 'grid', gap: 6 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="t">{r.h.title}</span><span className="m">due {formatInstant(r.h.deadlineAt, 'd MMM')}</span></span>
                  <span className="ra-bar" role="img" aria-label={`${r.completed} of ${r.total} done`} style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--ra-tint)' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 3, background: 'var(--ra-blue)' }} /></span>
                  <span className="m">{r.className} · {r.completed} of {r.total} done{r.files ? ` · ${r.files === 1 ? '1 file' : `${r.files} files`}` : ''}</span>
                </Link></li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
