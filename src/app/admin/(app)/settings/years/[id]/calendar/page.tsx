import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { academicYear } from '@/db/schema';
import { inRange, monthGrid, monthsBetween } from '@/lib/calendar';
import { formatCalendarDate } from '@/lib/dates';
import { listHolidays } from '@/server/holidays';
import { requireAdmin } from '@/server/next/actor';
import { PrintButton } from '@/components/PrintButton';

export const metadata = { title: 'Year calendar' };
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function YearCalendar({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('super');
  const id = Number((await params).id);
  const [y] = Number.isInteger(id) ? await db.select().from(academicYear).where(eq(academicYear.id, id)).limit(1) : [];
  if (!y) notFound();
  const hols = await listHolidays(db, y.id);
  const holidayOn = (d: string) => hols.find((h) => inRange(d, h.startsOn, h.endsOn));
  return (
    <section className="ra-card" aria-labelledby="cal-h">
      <div className="ra-card-h">
        <div><h2 id="cal-h">{y.title} calendar</h2><div className="ra-note">{formatCalendarDate(y.startsOn)} to {formatCalendarDate(y.endsOn)}. Highlighted days are holidays.</div></div>
        <div className="ra-toolbar no-print"><Link className="ra-btn" href="/admin/settings/holidays">Holidays</Link><PrintButton /></div>
      </div>
      <div className="ra-cal">
        {monthsBetween(y.startsOn, y.endsOn).map(({ year, month }) => (
          <table key={`${year}-${month}`}>
            <caption>{MONTH.format(new Date(Date.UTC(year, month, 1)))}</caption>
            <thead><tr>{DAYS.map((d) => <th key={d} scope="col" abbr={d}>{d[0]}</th>)}</tr></thead>
            <tbody>
              {monthGrid(year, month).map((w, i) => (
                <tr key={i}>
                  {w.map((d, j) => {
                    if (!d) return <td key={j} />;
                    const h = holidayOn(d);
                    const out = !inRange(d, y.startsOn, y.endsOn);
                    return <td key={j} className={h ? 'hol' : out ? 'out' : undefined} title={h?.title}><span>{Number(d.slice(8))}{h && <span className="sr-only">, {h.title}</span>}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {hols.length === 0 && <p className="ra-empty">No holidays added for this year yet.</p>}
    </section>
  );
}
