import Link from 'next/link';
import { db } from '@/db';
import { monthGrid as grid } from '@/lib/calendar';
import { requireAdmin } from '@/server/next/actor';
import { monthRange } from '@/server/attendance/registers';
import { absenteesBetween } from '@/server/attendance/teacher-logs';
import { todayIso } from '@/server/people/common';

export const metadata = { title: 'Absentees' };
const shift = (m: string, n: number) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function Absentees({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const m = (await searchParams).month;
  const month = /^\d{4}-\d{2}$/.test(m ?? '') ? m! : todayIso().slice(0, 7);
  const { from, to } = monthRange(month);
  const rows = await absenteesBetween(db, from, to);
  const [y, mo] = month.split('-').map(Number) as [number, number];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Teacher absentees</h1><p>{monthName(month)}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`?month=${shift(month, -1)}`}>Previous month</Link><Link className="ra-btn" href={`?month=${shift(month, 1)}`}>Next month</Link></div></div>
      <section className="ra-card">
        <div className="ra-table-wrap" tabIndex={0}><table className="ra-table" style={{ tableLayout: 'fixed', minWidth: 560 }}>
          <thead><tr>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <th key={d} scope="col">{d}</th>)}</tr></thead>
          <tbody>{grid(y, mo - 1).map((w, i) => (
            <tr key={i}>{w.map((d, j) => (
              <td key={j} style={{ verticalAlign: 'top', whiteSpace: 'normal', height: 64 }}>
                {d && <><b>{Number(d.slice(8))}</b>{rows.filter((r) => r.date === d).map((r) => <div key={r.name} className="ra-note" style={{ overflowWrap: 'anywhere' }}>{r.name}</div>)}</>}
              </td>
            ))}</tr>
          ))}</tbody>
        </table></div>
        {rows.length === 0 && <p className="ra-empty">No teacher absences this month.</p>}
      </section>
    </div>
  );
}
