import Link from 'next/link';
import { db } from '@/db';
import { pct1, quality } from '@/lib/attendance';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { attendanceStats } from '@/server/attendance/reports';
import { yearAndClasses } from '../../students/year-classes';
import { statsParams } from './params';

export const metadata = { title: 'Attendance stats' };

export default async function Stats({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const p = statsParams(sp);
  const [{ options }, rows] = await Promise.all([yearAndClasses(), attendanceStats(db, p)]);
  const qs = new URLSearchParams(Object.entries({ from: p.from, to: p.to, class: p.classId, below: p.below, above: p.above }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Attendance stats</h1><p>Per student, for a month or date range. Standard counts lates as attending; strict doesn’t.</p></div>
        <div className="ra-toolbar"><a className="ra-btn" href={`/admin/register/stats/export?${qs}`}>Download CSV</a><Link className="ra-btn" href="/admin/register/summary">Daily present stats</Link></div></div>
      <form className="ra-card ra-fields" action="/admin/register/stats" style={{ alignItems: 'end' }}>
        <div className="ra-field"><label htmlFor="st-f">From</label><input className="ra-input" id="st-f" type="date" name="from" defaultValue={p.from} /></div>
        <div className="ra-field"><label htmlFor="st-t">To</label><input className="ra-input" id="st-t" type="date" name="to" defaultValue={p.to} /></div>
        <div className="ra-field"><label htmlFor="st-c">Class</label><select className="ra-select" id="st-c" name="class" defaultValue={p.classId ?? ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="st-b">Below %</label><input className="ra-input" id="st-b" name="below" inputMode="decimal" defaultValue={p.below ?? ''} /></div>
        <div className="ra-field"><label htmlFor="st-a">Above %</label><input className="ra-input" id="st-a" name="above" inputMode="decimal" defaultValue={p.above ?? ''} /></div>
        <div><button className="ra-btn">Show</button></div>
      </form>
      <section className="ra-card">
        <div className="ra-note">{plural(rows.length, 'student')}</div>
        {rows.length === 0 ? <p className="ra-empty">No register entries match.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
            <thead><tr><th>Student</th><th className="opt">Class</th><th className="num">Entries</th><th className="num">Present</th><th className="num">Absent</th><th className="num">Late</th><th className="num">Percent</th><th className="num opt">Percent (strict)</th><th className="opt">Quality</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.studentId}><td className="wrap"><Link href={`/admin/register/student/${r.studentId}`}>{r.student!.firstName} {r.student!.surname}</Link></td><td className="opt wrap">{r.student!.classes ?? ''}</td>
                <td className="num">{r.summary.sessions}</td><td className="num">{r.summary.present}</td><td className="num">{r.summary.absent}</td><td className="num">{r.summary.late}</td>
                <td className="num">{pct1(r.summary.standardPct)}</td><td className="num opt">{pct1(r.summary.strictPct)}</td><td className="opt">{quality(r.summary.standardPct)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
