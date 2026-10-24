import { db } from '@/db';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { addDays } from '@/server/attendance/registers';
import { pendingLogs } from '@/server/attendance/teacher-logs';
import { todayIso } from '@/server/people/common';
import { LogRows } from '../LogRows';

export const metadata = { title: 'Pending logs' };

/** Days in the last four weeks a teacher was due (by working hours) with no log, or signed in but never out. */
export default async function Pending() {
  await requireAdmin();
  const today = todayIso();
  const rows = await pendingLogs(db, addDays(today, -28), addDays(today, -1));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Pending logs</h1><p>The last four weeks: days a teacher was due by their working hours but has no log, or signed in and never out.</p></div></div>
      <section className="ra-card">
        {rows.length === 0 ? <p className="ra-empty">Nothing pending.</p> : (
          <>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r) => <li key={`${r.teacherId}-${r.date}`}>{r.name} · {formatCalendarDate(r.date, 'EEE d MMM')} · {r.reason}</li>)}</ul>
            <LogRows rows={rows.map((r) => ({ teacherId: r.teacherId, name: r.name, date: r.date, timeIn: '', timeOut: '', absent: false, note: '', expected: r.expected }))} submit="Save these logs" />
          </>
        )}
      </section>
    </div>
  );
}
