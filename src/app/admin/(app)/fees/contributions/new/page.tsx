import { asc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { student } from '@/db/schema';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../../students/year-classes';
import { contributionAction } from '../../actions';
import { FeesHead } from '../../FeesHead';

export const metadata = { title: 'Create contribution' };

export default async function NewContribution() {
  await requireAdmin('fees');
  const [{ year, options }, students] = await Promise.all([yearAndClasses(),
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).where(inArray(student.status, ['Current', 'Waiting List', 'Accepted', 'On Hold'])).orderBy(asc(student.surname), asc(student.firstName))]);
  const today = todayIso();
  return (
    <div className="ra-page">
      <FeesHead title="Create contribution" desc={`Generate Contribution invoices${year ? ` in ${year.title}` : ''}. Each student is invoiced once for it.`} />
      {!year ? <p className="ra-empty">Add an academic year first.</p> : (
        <Form action={contributionAction} submit="Generate contribution invoices">
          <div className="ra-fields">
            <SelectField name="audience" label="Students" full options={[{ value: 'active', label: 'All active (Current) students' }, { value: 'waiting', label: 'Waiting list' }, { value: 'classes', label: 'Chosen classes' }, { value: 'students', label: 'Chosen students' }]} />
          </div>
          <Checks name="classIds" legend="Classes (for “Chosen classes”)" options={options} />
          <details><summary className="ra-link" style={{ display: 'inline-grid' }}>Choose students (for “Chosen students”)</summary>
            <Checks name="studentIds" legend="Students" options={students.map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName} (${s.status})` }))} />
          </details>
          <div className="ra-fields">
            <TextField name="description" label="Description" full help="Shown on each invoice, e.g. “Museum trip”" />
            <TextField name="amount" label="Amount (£)" inputMode="decimal" autoComplete="off" />
            <TextField name="invoiceDate" label="Invoice date" type="date" defaultValue={today} />
            <TextField name="dueDate" label="Due date" type="date" defaultValue={today} />
          </div>
        </Form>
      )}
    </div>
  );
}
