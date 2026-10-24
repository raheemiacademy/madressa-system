import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { maintenanceReport } from '@/server/people/classes';
import { fixMaintenanceAction } from '../actions';

export const metadata = { title: 'Class maintenance' };

export default async function Maintenance() {
  const admin = await requireAdmin();
  const r = await maintenanceReport(db);
  const n = r.leftOpen.length + r.oldYearOpen.length;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Class maintenance</h1><p>Class sizes are counted live, so they never drift. This checks class history for entries that should have ended.</p></div>
        <div className="ra-toolbar">{n > 0 && adminCan(admin.staff, 'edit') && <ActionButton className="ra-btn primary" action={fixMaintenanceAction} label={`Fix ${n === 1 ? '1 entry' : `${n} entries`}`} confirm="End these class entries?" />}</div></div>
      <section className="ra-card"><div className="ra-card-h"><div><h2>Students who left but are still in a class</h2><div className="ra-note">Fix class history: ends them on the student’s left date.</div></div></div>
        {r.leftOpen.length === 0 ? <p className="ra-empty">None.</p> : <table className="ra-table"><thead><tr><th>Student</th><th>Class</th><th>Left</th></tr></thead>
          <tbody>{r.leftOpen.map((x) => <tr key={x.id}><td className="wrap">{x.student}</td><td>{x.class}</td><td>{x.left_date ? formatCalendarDate(x.left_date) : 'No date'}</td></tr>)}</tbody></table>}
      </section>
      <section className="ra-card"><div className="ra-card-h"><div><h2>Students still in last year’s classes</h2><div className="ra-note">Fix student classes: ends them on the last day of that year. Use the new year wizard to move students on.</div></div></div>
        {r.oldYearOpen.length === 0 ? <p className="ra-empty">None.</p> : <table className="ra-table"><thead><tr><th>Student</th><th>Class</th><th>Year</th></tr></thead>
          <tbody>{r.oldYearOpen.map((x) => <tr key={x.id}><td className="wrap">{x.student}</td><td>{x.class}</td><td>{x.year}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}
