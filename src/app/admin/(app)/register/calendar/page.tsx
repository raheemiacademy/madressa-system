import Link from 'next/link';
import { db } from '@/db';
import { pct1 } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { absentCalendar } from '@/server/attendance/reports';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';

export const metadata = { title: 'Absent calendar' };
const shift = (m: string, n: number) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

export default async function AbsentCalendar({ searchParams }: { searchParams: Promise<{ month?: string; class?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : todayIso().slice(0, 7);
  const classId = Number(sp.class) || undefined;
  const { options } = await yearAndClasses();
  const days = (await absentCalendar(db, month, classId)).filter((d) => d.classes.length);
  const q = (o: Record<string, string | undefined>) => '?' + new URLSearchParams(Object.entries({ month, class: classId ? String(classId) : undefined, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Absent calendar</h1><p>Authorised absences, unauthorised absences and unauthorised lates, by day and class.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={q({ month: shift(month, -1) })}>Previous month</Link><Link className="ra-btn" href={q({ month: shift(month, 1) })}>Next month</Link></div></div>
      <nav className="ra-filters" aria-label="Class">
        <Link className="ra-filter" href={q({ class: undefined })} aria-current={!classId ? 'page' : undefined}>All classes</Link>
        {options.map((o) => <Link key={o.value} className="ra-filter" href={q({ class: o.value })} aria-current={String(classId) === o.value ? 'page' : undefined}>{o.label}</Link>)}
      </nav>
      <section className="ra-card" aria-label={new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
        {days.length === 0 ? <p className="ra-empty">No registers taken this month.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Day</th><th>Class</th><th className="num">Authorised</th><th className="num">Unauthorised</th><th className="num">Unauthorised lates</th><th className="num">Punctuality</th></tr></thead>
            <tbody>{days.flatMap((d) => d.classes.map((c, i) => (
              <tr key={`${d.date}-${c.id}`}><td>{i === 0 ? formatCalendarDate(d.date, 'EEE d MMM') : ''}</td><td className="wrap">{c.name}</td>
                <td className="num">{c.authorised}</td><td className="num">{c.unauthorised}</td><td className="num">{c.lates}</td><td className="num">{pct1(c.punctuality)}</td></tr>
            )))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
