import Link from 'next/link';
import { db } from '@/db';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { addDays } from '@/server/attendance/registers';
import { mondayOf, weekLogs } from '@/server/attendance/teacher-logs';
import { todayIso } from '@/server/people/common';
import { LogRows } from './LogRows';

export const metadata = { title: 'Teacher logs' };
const t = (v: string | null) => v?.slice(0, 5) ?? '';

export default async function TeacherLogs({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const admin = await requireAdmin();
  const w = (await searchParams).week;
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(w ?? '') ? w! : todayIso());
  const { days, rows } = await weekLogs(db, monday);
  const canEdit = adminCan(admin.staff, 'edit');
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Teacher logs</h1><p>Staff sign-in and sign-out by week</p></div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href="/admin/teacher-logs/add">Add logs</Link>}
          {canEdit && <Link className="ra-btn" href="/admin/teacher-logs/import">Import CSV</Link>}
          <Link className="ra-btn" href={`/admin/teacher-logs/print?from=${days[0]}&to=${days[6]}`}>Print</Link>
        </div></div>
      <div className="ra-more"><span className="ra-more-l">More</span>
        {[['/admin/teacher-logs/pending', 'Pending logs'], ['/admin/teacher-logs/absentees', 'Absentees'], ['/admin/teacher-logs/kiosk', 'Kiosk devices']].map(([h, l]) => <Link key={h} className="ra-btn" href={h!}>{l}</Link>)}
      </div>
      <section className="ra-card" aria-labelledby="wk-h">
        <div className="ra-card-h"><div><h2 id="wk-h">Week of {formatCalendarDate(monday, 'd MMMM yyyy')}</h2><div className="ra-note">Time in–out each day. “Absent” means marked absent; a dash means no log.</div></div>
          <nav className="ra-toolbar" aria-label="Week"><Link className="ra-btn" href={`?week=${addDays(monday, -7)}`}>Previous week</Link><Link className="ra-btn" href={`?week=${addDays(monday, 7)}`}>Next week</Link></nav></div>
        {rows.length === 0 ? <p className="ra-empty">No employed or volunteer teachers yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Teacher</th>{days.map((d) => <th key={d}>{day(d)}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="wrap">{r.name}</td>
                {r.cells.map((c) => <td key={c.date} title={c.expected ? `Expected ${t(c.expected.startTime)}–${t(c.expected.endTime)}` : undefined}>
                  {c.log ? (c.log.absent ? <span className="ra-warn">Absent</span> : `${t(c.log.timeIn)}–${t(c.log.timeOut)}`) : c.expected ? <span className="ra-muted">due {t(c.expected.startTime)}</span> : ''}</td>)}</tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {canEdit && rows.length > 0 && (
        <section className="ra-card" aria-labelledby="ed-h">
          <div className="ra-card-h"><div><h2 id="ed-h">Update this week</h2><div className="ra-note">Days each teacher was due or has a log.</div></div></div>
          <LogRows rows={rows.flatMap((r) => r.cells.filter((c) => c.log || c.expected).map((c) => ({ teacherId: r.id, name: r.name, date: c.date, timeIn: t(c.log?.timeIn ?? null), timeOut: t(c.log?.timeOut ?? null), absent: !!c.log?.absent, note: c.log?.note ?? '', expected: c.expected ? `${t(c.expected.startTime)}–${t(c.expected.endTime)}` : '' })))} />
        </section>
      )}
    </div>
  );
}
