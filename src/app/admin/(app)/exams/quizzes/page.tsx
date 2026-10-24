import Link from 'next/link';
import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { subject, teacher } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant, toUkLocal } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listQuizzes } from '@/server/learning/exams';
import { yearAndClasses } from '../../students/year-classes';
import { deleteQuizAction, saveQuizAction } from '../actions';
import { LEARNING_TOOLS } from '../tools';

export const metadata = { title: 'Quizzes' };
const STATUS = [{ value: 'draft', label: 'Draft' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }];

/** §15 Quizzes (beta): only the details the inventory lists (question 6). Questions and marking aren't specified. */
export default async function Quizzes() {
  const admin = await requireAdmin();
  const [{ options }, rows, subjects, teachers] = await Promise.all([yearAndClasses(), listQuizzes(db), db.select().from(subject).orderBy(asc(subject.name)), db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name))]);
  const subjectOpts = [{ value: '', label: 'No subject' }, ...subjects.map((s) => ({ value: String(s.id), label: s.name }))];
  const teacherOpts = [{ value: '', label: 'No teacher' }, ...teachers.map((t) => ({ value: String(t.id), label: t.name }))];
  const fields = (q?: (typeof rows)[number]) => (
    <>
      <div className="ra-fields">
        <TextField name="title" id={`qt-${q?.q.id ?? 'new'}`} label="Title" defaultValue={q?.q.title ?? ''} />
        <SelectField name="subjectId" id={`qs-${q?.q.id ?? 'new'}`} label="Subject" defaultValue={String(q?.q.subjectId ?? '')} options={subjectOpts} />
        <TextField name="startsAt" id={`qa-${q?.q.id ?? 'new'}`} label="Starts" type="datetime-local" defaultValue={q ? toUkLocal(q.q.startsAt) : ''} />
        <TextField name="endsAt" id={`qe-${q?.q.id ?? 'new'}`} label="Ends" type="datetime-local" defaultValue={q ? toUkLocal(q.q.endsAt) : ''} />
        <SelectField name="teacherId" id={`qh-${q?.q.id ?? 'new'}`} label="Teacher" defaultValue={String(q?.q.teacherId ?? '')} options={teacherOpts} />
        <SelectField name="status" id={`qx-${q?.q.id ?? 'new'}`} label="Status" defaultValue={q?.q.status ?? 'draft'} options={STATUS} />
      </div>
      <Checks name="classIds" legend="Classes" options={options} checked={(q?.q.classIds ?? []).map(String)} />
    </>
  );
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Quizzes</h1><p>Beta: a quiz’s subject, times, teacher and classes</p></div></div>
      <div className="ra-more"><span className="ra-more-l">More</span>{LEARNING_TOOLS.filter(([h]) => h !== '/admin/exams/quizzes').map(([h, l]) => <Link key={h} className="ra-btn" href={h}>{l}</Link>)}</div>
      {rows.length === 0 ? <p className="ra-empty">No quizzes yet.</p> : rows.map((q) => (
        <details key={q.q.id} className="ra-card">
          <summary><b>{q.q.title}</b> <span className="ra-muted">{q.subjectName ?? ''} · {formatInstant(q.q.startsAt, 'dd/MM/yyyy HH:mm')}–{formatInstant(q.q.endsAt, 'HH:mm')}</span> <Chip>{STATUS.find((s) => s.value === q.q.status)!.label}</Chip></summary>
          <Form action={saveQuizAction.bind(null, q.q.id)} card={false} savebar={false} submit="Save quiz">{fields(q)}</Form>
          {adminCan(admin.staff, 'delete') && <ActionButton action={deleteQuizAction.bind(null, q.q.id)} label="Delete quiz" danger confirm={`Delete “${q.q.title}”?`} />}
        </details>
      ))}
      {adminCan(admin.staff, 'edit') && <Form action={saveQuizAction.bind(null, null)} submit="Add quiz" resetOnSuccess><div className="ra-card-h"><div><h2>New quiz</h2></div></div>{fields()}</Form>}
    </div>
  );
}
