import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { exam, subject } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { examResults, listGradeSystems } from '@/server/learning/exams';
import { yearAndClasses } from '../../students/year-classes';
import { deleteExamAction, deleteTestAction, saveExamAction, saveTestAction, statusAction } from '../actions';

export const metadata = { title: 'Exam' };
const STATUS_C: Record<string, string> = { open: 'var(--color-ok)', closed: 'var(--ra-blue)', locked: 'var(--color-fg-muted)' };

/** Add or edit an exam, its status, and its papers ("edit tests"). */
export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const raw = (await params).id;
  // Anyone can read an exam; adding one needs Can edit.
  const admin = await requireAdmin(raw === 'new' ? 'edit' : 'view');
  const id = raw === 'new' ? null : Number(raw);
  const [e] = id ? await db.select().from(exam).where(eq(exam.id, id)) : [];
  if (id && !e) notFound();
  const [{ options }, systems, subjects, data] = await Promise.all([yearAndClasses(), listGradeSystems(db), db.select().from(subject).orderBy(asc(subject.name)), id ? examResults(db, id) : null]);
  const canEdit = adminCan(admin.staff, 'edit') && e?.status !== 'locked';
  const subjectOpts = [{ value: '', label: 'No subject' }, ...subjects.map((s) => ({ value: String(s.id), label: s.name }))];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{e ? e.title : 'Add exam'}</h1><p>{e ? <>{data?.className} · <Chip colour={STATUS_C[e.status]}>{e.status[0]!.toUpperCase() + e.status.slice(1)}</Chip></> : 'Choose the class, then add its papers'}</p></div>
        {e && (
          <div className="ra-toolbar">
            <Link className="ra-btn primary" href={`/admin/exams/${e.id}/results`}>Results</Link>
            {adminCan(admin.staff, 'edit') && (['open', 'closed', 'locked'] as const).filter((s) => s !== e.status).map((s) => (
              <ActionButton key={s} action={statusAction.bind(null, e.id, s)} label={s === 'open' ? 'Reopen' : s === 'closed' ? 'Close' : 'Lock'} confirm={s === 'locked' ? 'Lock this exam? Results can’t be changed while it’s locked.' : undefined} />
            ))}
            {adminCan(admin.staff, 'delete') && <ActionButton action={deleteExamAction.bind(null, e.id)} label="Delete" danger confirm={`Delete “${e.title}” and all its results?`} />}
          </div>
        )}</div>
      {e?.status === 'locked' && <div className="ra-banners"><div className="ra-banner"><div>This exam is locked. Reopen it to make changes.</div></div></div>}
      <Form action={saveExamAction.bind(null, e?.id ?? null)} submit={e ? 'Save exam' : 'Add exam'}>
        <div className="ra-fields">
          <TextField name="title" label="Title" defaultValue={e?.title ?? ''} disabled={!canEdit && !!e} />
          <SelectField name="classId" label="Class" defaultValue={String(e?.classId ?? '')} options={options} />
          <SelectField name="official" label="Type" defaultValue={e && !e.official ? 'progressive' : 'official'} options={[{ value: 'official', label: 'Official exam (used on reports)' }, { value: 'progressive', label: 'Progressive test' }]} />
          <TextField name="date" label="Date" type="date" defaultValue={e?.date ?? ''} />
          <SelectField name="gradeSystemId" label="Grades" defaultValue={String(e?.gradeSystemId ?? '')} options={[{ value: '', label: 'The default grading system' }, ...systems.map((s) => ({ value: String(s.id), label: s.name }))]} />
        </div>
      </Form>
      {e && data && (
        <section className="ra-card" aria-labelledby="papers-h">
          <div className="ra-card-h"><div><h2 id="papers-h">Papers</h2><div className="ra-note">Each paper is marked out of its maximum. Total available: {data.maxTenths / 10}</div></div></div>
          {data.tests.length === 0 ? <p className="ra-empty">No papers yet. Add one below.</p> : data.tests.map((t) => (
            <details key={t.t.id}>
              <summary><b>{t.t.name}</b> <span className="ra-muted">out of {t.t.maxMarks}{t.subjectName ? ` · ${t.subjectName}` : ''}</span></summary>
              {canEdit && (
                <>
                  <Form action={saveTestAction.bind(null, e.id, t.t.id)} card={false} savebar={false} submit="Save paper">
                    <div className="ra-fields">
                      <TextField name="name" id={`pn-${t.t.id}`} label="Paper" defaultValue={t.t.name} />
                      <SelectField name="subjectId" id={`ps-${t.t.id}`} label="Subject" defaultValue={String(t.t.subjectId ?? '')} options={subjectOpts} />
                      <TextField name="maxMarks" id={`pm-${t.t.id}`} label="Out of" inputMode="numeric" defaultValue={String(t.t.maxMarks)} />
                    </div>
                  </Form>
                  <ActionButton action={deleteTestAction.bind(null, e.id, t.t.id)} label="Remove paper" danger confirm={`Remove ${t.t.name} and its marks?`} />
                </>
              )}
            </details>
          ))}
          {canEdit && (
            <Form action={saveTestAction.bind(null, e.id, null)} card={false} savebar={false} submit="Add paper" resetOnSuccess>
              <div className="ra-fields">
                <TextField name="name" id="new-paper" label="New paper" />
                <SelectField name="subjectId" id="new-subject" label="Subject" options={subjectOpts} />
                <TextField name="maxMarks" id="new-max" label="Out of" inputMode="numeric" defaultValue="100" />
              </div>
            </Form>
          )}
        </section>
      )}
    </div>
  );
}
