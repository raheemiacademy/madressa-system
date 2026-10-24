import Link from 'next/link';
import { db } from '@/db';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { monthGrid } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';
import { decideAction } from '../actions';
import { RegisterGrid } from '../RegisterGrid';

export const metadata = { title: 'Daily register' };

export default async function Daily({ searchParams }: { searchParams: Promise<{ class?: string; month?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const { year, options } = await yearAndClasses();
  const classId = Number(sp.class) || Number(options[0]?.value) || null;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : todayIso().slice(0, 7);
  const months: string[] = [];
  if (year) for (let d = new Date(`${year.startsOn.slice(0, 7)}-01T00:00:00Z`); d <= new Date(`${year.endsOn.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
  const g = classId ? await monthGrid(db, classId, month) : null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Daily register</h1><p>Pick a class and month. Click a day heading to take or change that register.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/register/monthly?class=${classId ?? ''}&month=${month}`}>Monthly register</Link></div></div>
      <nav className="ra-filters" aria-label="Months">{months.map((m) => <Link key={m} className="ra-filter" href={`?class=${classId ?? ''}&month=${m}`} aria-current={m === month ? 'page' : undefined}>{new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</Link>)}</nav>
      <section className="ra-card" aria-labelledby="dr-h"><RegisterGrid classOptions={options} classId={classId} month={month} headingId="dr-h" /></section>
      {g && (
        <section className="ra-card" aria-labelledby="mv-h">
          <div className="ra-card-h"><div><h2 id="mv-h">Multiple validations</h2><div className="ra-note">Absences and lates this month with no authorisation decision yet.</div></div></div>
          {g.unvalidated.length === 0 ? <p className="ra-empty">Nothing to validate.</p> : adminCan(admin.staff, 'edit') ? (
            <Form action={decideAction} card={false} submit="Apply to ticked entries">
              <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
                <thead><tr><th><span className="sr-only">Tick</span></th><th>Student</th><th>Date</th><th>Absent or late</th><th className="num">Minutes late</th><th>Note or reason</th></tr></thead>
                <tbody>{g.unvalidated.map((m) => (
                  <tr key={m.id}><td><input type="checkbox" name="markIds" value={m.id} aria-label={`${m.name!.firstName} ${m.name!.surname}, ${m.date}`} /></td>
                    <td className="wrap">{m.name!.firstName} {m.name!.surname}</td><td>{formatCalendarDate(m.date)}</td><td>{m.mark === 'late' ? 'Late' : 'Absent'}{m.notified ? ' (notified)' : ''}</td>
                    <td className="num">{m.lateMinutes ?? ''}</td><td className="wrap">{m.note ?? ''}</td></tr>
                ))}</tbody>
              </table></div>
              <div className="ra-fields">
                <SelectField name="authorised" label="Set as" options={[{ value: 'yes', label: 'Authorised' }, { value: 'no', label: 'Unauthorised' }]} />
                <TextField name="note" label="Note or reason (optional)" />
              </div>
            </Form>
          ) : <p className="ra-empty">{g.unvalidated.length} entries need a decision. You need the Can edit access level.</p>}
        </section>
      )}
    </div>
  );
}
