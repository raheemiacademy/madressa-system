import Link from 'next/link';
import { db } from '@/db';
import { pct1 } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { addDays } from '@/server/attendance/registers';
import { dailySummary } from '@/server/attendance/reports';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';

export const metadata = { title: 'Daily summary' };

/** Daily Summary, Daily Present and Daily Sessions Attendance for one date. */
export default async function Summary({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireAdmin();
  const d = (await searchParams).date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d! : todayIso();
  const { year } = await yearAndClasses();
  const rows = year ? (await dailySummary(db, date, year.id)).filter((r) => r.times.length || r.marked) : [];
  const total = rows.reduce((t, r) => ({ onRoll: t.onRoll + r.onRoll, present: t.present + r.present, late: t.late + r.late, absent: t.absent + r.absent, sessions: t.sessions + r.sessions }), { onRoll: 0, present: 0, late: 0, absent: 0, sessions: 0 });
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Daily summary</h1><p>{formatCalendarDate(date, 'EEEE d MMMM yyyy')}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`?date=${addDays(date, -1)}`}>Previous day</Link><Link className="ra-btn" href={`?date=${addDays(date, 1)}`}>Next day</Link></div></div>
      <div className="ra-kpis">
        {[['Present', total.present], ['Late', total.late], ['Absent', total.absent], ['Attendance', pct1(total.sessions ? Math.round(((total.present + total.late) / total.sessions) * 1000) / 10 : null)]].map(([k, v]) => (
          <div key={k} className="ra-kpi"><div className="ra-kpi-top">{k}</div><div className="ra-kpi-val">{v}</div></div>
        ))}
      </div>
      <section className="ra-card">
        {rows.length === 0 ? <p className="ra-empty">No registers were due on this date.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Class</th><th>Sessions</th><th className="num">On roll</th><th className="num">Marked</th><th className="num">Present</th><th className="num">Late</th><th className="num">Absent</th><th className="num">%</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.classId}><td className="wrap">{r.name}</td><td>{r.times.join(', ') || '—'}</td><td className="num">{r.onRoll}</td>
                <td className="num">{r.marked < r.onRoll * Math.max(1, r.times.length) ? <span className="ra-warn">{r.marked}</span> : r.marked}</td>
                <td className="num">{r.present}</td><td className="num">{r.late}</td><td className="num">{r.absent}</td><td className="num">{pct1(r.standardPct)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
