import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { student } from '@/db/schema';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { deleteEntriesAction } from '../actions';

export const metadata = { title: 'Delete register entries' };

export default async function DeleteEntries() {
  await requireAdmin('delete');
  const [{ options }, students] = await Promise.all([yearAndClasses(), db.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).orderBy(asc(student.surname))]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Delete register entries</h1><p>Permanently removes marks in a date range for a class or chosen students. This can’t be undone.</p></div></div>
      <Form action={deleteEntriesAction} submit="Delete entries">
        <div className="ra-fields">
          <TextField name="from" label="From" type="date" />
          <TextField name="to" label="To" type="date" />
          <SelectField name="classId" label="Class" options={[{ value: '', label: 'Any class (choose students below)' }, ...options]} />
        </div>
        <details><summary className="ra-link" style={{ display: 'inline-grid' }}>Or only these students</summary>
          <Checks name="studentIds" legend="Students" options={students.map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName}` }))} />
        </details>
        <TextField name="confirmName" label="Type the school name to confirm" autoComplete="off" />
      </Form>
    </div>
  );
}
