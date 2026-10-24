import Link from 'next/link';
import { db } from '@/db';
import { pct1 } from '@/lib/attendance';
import { requireAdmin } from '@/server/next/actor';
import { monthGrid } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';

export const metadata = { title: 'Monthly register' };

export default async function Monthly({ searchParams }: { searchParams: Promise<{ class?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { options } = await yearAndClasses();
  const classId = Number(sp.class) || Number(options[0]?.value) || null;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : todayIso().slice(0, 7);
  const g = classId ? await monthGrid(db, classId, month) : null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Monthly register</h1><p>Each student’s month at a glance.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/register/daily?class=${classId ?? ''}&month=${month}`}>Daily register</Link><Link className="ra-btn" href={`/admin/register/download?class=${classId ?? ''}&month=${month}&kind=monthly`}>Print</Link></div></div>
      <form className="ra-card ra-toolbar" action="/admin/register/monthly">
        <label className="sr-only" htmlFor="mm-c">Class</label><select className="ra-select" id="mm-c" name="class" defaultValue={classId ?? ''}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <label className="sr-only" htmlFor="mm-m">Month</label><input className="ra-input" style={{ width: 'auto' }} id="mm-m" type="month" name="month" defaultValue={month} />
        <button className="ra-btn">Show</button>
      </form>
      <section className="ra-card">
        {!g ? <p className="ra-empty">No classes this year yet.</p> : g.rows.length === 0 ? <p className="ra-empty">No students in this class this month.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Student</th><th className="num">Sessions</th><th className="num">Present</th><th className="num">Late</th><th className="num">Absent</th><th className="num opt">Authorised</th><th className="num opt">Unauthorised</th><th className="num">%</th><th className="num opt">Strict %</th></tr></thead>
            <tbody>{g.rows.map((r) => (
              <tr key={r.id}><td className="wrap"><Link href={`/admin/register/student/${r.id}`}>{r.firstName} {r.surname}</Link></td>
                <td className="num">{r.summary.sessions}</td><td className="num">{r.summary.present}</td><td className="num">{r.summary.late}</td><td className="num">{r.summary.absent}</td>
                <td className="num opt">{r.summary.absentAuthorised}</td><td className="num opt">{r.summary.absentUnauthorised + r.summary.absentUnspecified}</td>
                <td className="num">{pct1(r.summary.standardPct)}</td><td className="num opt">{pct1(r.summary.strictPct)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
