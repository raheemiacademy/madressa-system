import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { todayIso } from '@/server/people/common';
import { myExams } from '@/server/portal/teacher';
import { examAction } from '../actions';

export const metadata = { title: 'Exams and tests' };
const STATUS: Record<string, string> = { open: 'var(--color-ok)', closed: 'var(--ra-blue)', locked: 'var(--color-fg-muted)' };

/** §15/§20 Exams and progressive tests for the teacher's classes: add one, then its papers and results. */
export default async function Exams() {
  const t = await requireTeacher();
  const exams = shows(t.ctx, 'Exams') && shows(t.ctx, 'Progressive Tests') ? await myExams(db, t.ctx)
    : (await myExams(db, t.ctx)).filter((e) => (e.official ? shows(t.ctx, 'Exams') : shows(t.ctx, 'Progressive Tests')));
  const types = [...(shows(t.ctx, 'Exams') ? [{ value: 'official', label: 'Official exam (used on reports)' }] : []), ...(shows(t.ctx, 'Progressive Tests') ? [{ value: 'progressive', label: 'Progressive test' }] : [])];
  return (
    <>
      <PortalHead title="Exams and tests" back="/teacher/more" />
      <main className="rp-main">
        {!exams.length ? <p className="rp-empty">No exams or tests for your classes yet.</p> : (
          <ul className="rp-list">
            {exams.map((e) => <li key={e.id}><Link className="tap" href={`/teacher/exams/${e.id}`}><span className="t">{e.title}</span><span className="v"><Chip colour={STATUS[e.status]}>{e.status[0]!.toUpperCase() + e.status.slice(1)}</Chip></span>
              <span className="m">{t.ctx.classes.find((c) => c.id === e.classId)?.name} · {e.official ? 'Exam' : 'Progressive test'} · {formatCalendarDate(e.date)}</span></Link></li>)}
          </ul>
        )}
        {types.length > 0 && t.ctx.classes.length > 0 && (
          <Form action={examAction} submit="Add" savebar={false}>
            <h2 style={{ margin: 0 }}>Add an exam or test</h2>
            <div className="ra-fields">
              <SelectField name="classId" label="Class" options={t.ctx.classes.map((c) => ({ value: String(c.id), label: c.name }))} />
              <SelectField name="official" label="Type" options={types} />
              <TextField name="title" label="Title" full autoComplete="off" />
              <TextField name="date" label="Date" type="date" defaultValue={todayIso()} />
            </div>
          </Form>
        )}
      </main>
    </>
  );
}
