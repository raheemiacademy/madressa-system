import Link from 'next/link';
import { db } from '@/db';
import { pct1 } from '@/lib/attendance';
import { getAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { monthGrid } from '@/server/attendance/registers';
import { GridTable } from './GridTable';

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Daily Register grid: class + month picker, students × register days, % per student. */
export async function RegisterGrid({ classOptions, classId, month, headingId, compact = false }: { classOptions: { value: string; label: string }[]; classId: number | null; month: string; headingId: string; compact?: boolean }) {
  const admin = await getAdmin();
  const name = classOptions.find((o) => o.value === String(classId))?.label;
  const g = classId ? await monthGrid(db, classId, month) : null;
  return (
    <>
      <div className="ra-card-h">
        <div><h2 id={headingId}>Daily register{name ? ` · ${name}` : ''} · {MONTH.format(new Date(`${month}-01T00:00:00Z`))}</h2>
          <div className="ra-note">View mode. Click an absence or late to add a reason or authorise it.</div></div>
        {compact && classId && <Link className="ra-link" href={`/admin/register/daily?class=${classId}&month=${month}`}>Open full register</Link>}
      </div>
      <form className="ra-toolbar" action={compact ? '/admin/register' : '/admin/register/daily'}>
        <label className="sr-only" htmlFor={`${headingId}-c`}>Class</label>
        <select className="ra-select" id={`${headingId}-c`} name="class" defaultValue={classId ?? ''}>{classOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        {!compact && <><label className="sr-only" htmlFor={`${headingId}-m`}>Month</label><input className="ra-input" style={{ width: 'auto' }} id={`${headingId}-m`} type="month" name="month" defaultValue={month} /></>}
        <button className="ra-btn">Show</button>
      </form>
      <div className="ra-legend">
        {[['P', 'Present'], ['L', 'Late'], ['A', 'Authorised'], ['N', 'Notified'], ['U', 'Unauthorised'], ['E', 'Left early']].map(([k, l]) => <span key={k}><span className={`ra-mk ra-mk-${k}`}>{k}</span>{l}</span>)}
        <span><span className="ra-mk ra-mk-H">H</span>Holiday</span>
      </div>
      {!g ? <p className="ra-empty">No classes this year yet.</p> : g.days.length === 0 ? <p className="ra-empty">This class has no register sessions in its timetable. Add sessions on the class page.</p> : (
        <GridTable days={g.days} canEdit={!!admin && adminCan(admin.staff, 'edit')} classId={classId!}
          rows={g.rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.surname}`, cells: r.cells, pct: pct1(r.summary.standardPct) }))} />
      )}
    </>
  );
}
