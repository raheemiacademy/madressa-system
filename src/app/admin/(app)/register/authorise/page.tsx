import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceMark, registerSession, schoolClass, student } from '@/db/schema';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { addDays } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';
import { decideAction } from '../actions';

export const metadata = { title: 'Mass authorise' };

/** Recent absences and lates with no decision: tick, add a note, authorise or unauthorise, set notified. */
export default async function MassAuthorise({ searchParams }: { searchParams: Promise<{ days?: string; all?: string }> }) {
  await requireAdmin('edit');
  const sp = await searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.days) || 14));
  const today = todayIso();
  const rows = await db.select({ m: attendanceMark, date: registerSession.date, time: registerSession.startTime, cls: schoolClass.name, first: student.firstName, last: student.surname })
    .from(attendanceMark).innerJoin(registerSession, eq(registerSession.id, attendanceMark.sessionId)).innerJoin(schoolClass, eq(schoolClass.id, registerSession.classId)).innerJoin(student, eq(student.id, attendanceMark.studentId))
    .where(and(inArray(attendanceMark.mark, ['absent', 'late']), gte(registerSession.date, addDays(today, -days + 1)), lte(registerSession.date, today), sp.all === '1' ? undefined : isNull(attendanceMark.authorised)))
    .orderBy(desc(registerSession.date), student.surname).limit(500);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Mass authorise</h1><p>Absences and lates from the last {days} days{sp.all === '1' ? '' : ' that still need a decision'}.</p></div></div>
      <form className="ra-card ra-toolbar" action="/admin/register/authorise">
        <div className="ra-field"><label htmlFor="ma-d">Days back</label><input className="ra-input" style={{ width: 100 }} id="ma-d" name="days" type="number" min={1} max={90} defaultValue={days} /></div>
        <label className="ra-check" style={{ alignSelf: 'end' }}><input type="checkbox" name="all" value="1" defaultChecked={sp.all === '1'} /><span>Include ones already decided</span></label>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Show</button>
      </form>
      {rows.length === 0 ? <div className="ra-card"><p className="ra-empty">Nothing needs a decision.</p></div> : (
        <Form action={decideAction} submit="Apply to ticked entries">
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 560 }}><table className="ra-table">
            <thead><tr><th><span className="sr-only">Tick</span></th><th>Date</th><th>Student</th><th className="opt">Class</th><th>Entry</th><th className="opt">Decision</th><th>Note</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.m.id}>
                <td><input type="checkbox" name="markIds" value={r.m.id} aria-label={`${r.first} ${r.last}, ${r.date}`} /></td>
                <td>{formatCalendarDate(r.date, 'EEE dd/MM')}</td><td className="wrap">{r.first} {r.last}</td><td className="opt wrap">{r.cls}</td>
                <td>{r.m.mark === 'late' ? `Late${r.m.lateMinutes ? ` ${r.m.lateMinutes} min` : ''}` : 'Absent'}{r.m.notified ? ' · notified' : ''}</td>
                <td className="opt">{r.m.authorised === null ? 'Not decided' : r.m.authorised ? 'Authorised' : 'Unauthorised'}</td><td className="wrap">{r.m.note ?? ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="ra-fields">
            <SelectField name="authorised" label="Authorisation" options={[{ value: 'yes', label: 'Authorise' }, { value: 'no', label: 'Unauthorise' }, { value: 'keep', label: 'Leave as it is' }]} />
            <SelectField name="notified" label="Notified" options={[{ value: 'keep', label: 'Leave as it is' }, { value: 'yes', label: 'Parent notified' }, { value: 'no', label: 'Not notified' }]} />
            <TextField name="note" label="Note (replaces the current note)" />
          </div>
        </Form>
      )}
    </div>
  );
}
