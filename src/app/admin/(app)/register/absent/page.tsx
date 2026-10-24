import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { student } from '@/db/schema';
import { Check, Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { markAbsentAction } from '../actions';

export const metadata = { title: 'Mark students absent' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default async function MarkAbsent({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  await requireAdmin('edit');
  const pre = (await searchParams).student ?? '';
  const students = await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).orderBy(asc(student.surname), asc(student.firstName));
  const today = todayIso();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Mark students absent</h1><p>Fills every register for the student’s classes in the dates you choose. Other students on those registers aren’t touched.</p></div></div>
      <Form action={markAbsentAction} submit="Complete registers" resetOnSuccess>
        <div className="ra-fields">
          <SelectField name="studentId" label="Student" defaultValue={pre} options={[{ value: '', label: 'Choose a student' }, ...students.filter((s) => s.status === 'Current' || String(s.id) === pre).map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName} (#${s.id})` }))]} />
          <TextField name="from" label="From" type="date" defaultValue={today} />
          <TextField name="to" label="To" type="date" defaultValue={today} />
          <SelectField name="authorised" label="Authorisation" options={[{ value: '', label: 'Not decided yet' }, { value: 'yes', label: 'Authorised' }, { value: 'no', label: 'Unauthorised' }]} />
          <TextField name="note" label="Note or reason" full />
        </div>
        <Checks name="weekdays" legend="Only on these days (leave blank for every day)" options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} />
        <Check name="notified" label="The parent notified the school" />
      </Form>
    </div>
  );
}
