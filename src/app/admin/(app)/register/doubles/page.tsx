import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { doubleEntries } from '@/server/attendance/reports';
import { fixDoublesAction } from '../actions';

export const metadata = { title: 'Double entries' };

export default async function Doubles() {
  const admin = await requireAdmin();
  const rows = await doubleEntries(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Double entries</h1><p>Students marked on two registers at the same date and time, usually because they’re in two classes.</p></div>
        <div className="ra-toolbar">{rows.length > 0 && adminCan(admin.staff, 'delete') && <ActionButton className="ra-btn primary" action={fixDoublesAction} label="Delete duplicate entries" confirm="Keep the most recent entry of each double and delete the rest?" />}</div></div>
      <section className="ra-card">
        {rows.length === 0 ? <p className="ra-empty">No double entries.</p> : (
          <table className="ra-table"><thead><tr><th>Student</th><th>Date</th><th>Time</th><th>Classes (kept first)</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={`${r.student_id}-${r.date}-${r.start_time}`}><td className="wrap">{r.name}</td><td>{formatCalendarDate(r.date)}</td><td>{r.start_time.slice(0, 5)}</td><td className="wrap">{r.classes.join(', ')}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
