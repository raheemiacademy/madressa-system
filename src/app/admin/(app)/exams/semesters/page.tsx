import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { semester } from '@/db/schema';
import { Checks, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { listExams } from '@/server/learning/exams';
import { yearAndClasses } from '../../students/year-classes';
import { saveSemesterAction } from '../actions';
import { LEARNING_TOOLS } from '../tools';

export const metadata = { title: 'Semesters' };

/** §15 Semesters: several exams combined into one result per student (and linkable to an EOTY report). */
export default async function Semesters() {
  await requireAdmin();
  const { year, options } = await yearAndClasses();
  const [rows, exams] = year ? await Promise.all([db.select().from(semester).where(eq(semester.academicYearId, year.id)), listExams(db, { yearId: year.id })]) : [[], []];
  const examOpts = exams.map((e) => ({ value: String(e.e.id), label: `${e.e.title} (${e.className})` }));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Semesters</h1><p>Combine exams into one result set{year ? ` for ${year.title}` : ''}</p></div></div>
      <div className="ra-more"><span className="ra-more-l">More</span>{LEARNING_TOOLS.filter(([h]) => h !== '/admin/exams/semesters').map(([h, l]) => <Link key={h} className="ra-btn" href={h}>{l}</Link>)}</div>
      {rows.length === 0 ? <p className="ra-empty">No semesters yet.</p> : rows.map((s) => (
        <details key={s.id} className="ra-card">
          <summary><b>{s.title}</b> <span className="ra-muted">{s.examIds.length === 1 ? '1 exam' : `${s.examIds.length} exams`}</span> · <Link className="ra-link" href={`/admin/exams/semesters/${s.id}`}>Results</Link></summary>
          <Form action={saveSemesterAction.bind(null, s.id)} card={false} savebar={false} submit="Save semester">
            <TextField name="title" id={`st-${s.id}`} label="Title" defaultValue={s.title} />
            <Checks name="examIds" legend="Exams" options={examOpts} checked={s.examIds.map(String)} />
            <Checks name="classIds" legend="Classes (none = every class in those exams)" options={options} checked={s.classIds.map(String)} />
          </Form>
        </details>
      ))}
      {year && (
        <Form action={saveSemesterAction.bind(null, null)} submit="Add semester" resetOnSuccess>
          <div className="ra-card-h"><div><h2>New semester</h2></div></div>
          <TextField name="title" label="Title" />
          <Checks name="examIds" legend="Exams" options={examOpts} />
          <Checks name="classIds" legend="Classes (none = every class in those exams)" options={options} />
        </Form>
      )}
    </div>
  );
}
