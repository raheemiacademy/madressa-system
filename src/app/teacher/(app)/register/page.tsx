import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { addDays } from '@/server/attendance/registers';
import { requireTeacher } from '@/server/next/portal';
import { todayIso } from '@/server/people/common';
import { classesToday } from '@/server/portal/teacher';

export const metadata = { title: 'Registers' };

/** §6/§20 Registers for the teacher's register classes: today, or catching up on the past week. */
export default async function Registers({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const t = await requireTeacher('Registers');
  const today = todayIso();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, -i));
  const raw = (await searchParams).date;
  const date = raw && days.includes(raw) ? raw : today;
  const sessions = (await classesToday(db, t.ctx, date)).filter((c) => c.canRegister && c.takesRegister);
  return (
    <>
      <PortalHead title="Registers" kicker={formatCalendarDate(date, 'EEEE d MMMM')} />
      <main className="rp-main">
        <nav className="ra-filters" aria-label="Day" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {days.map((d) => <Link key={d} className="ra-filter tap" href={`/teacher/register?date=${d}`} aria-current={d === date ? 'page' : undefined}>{d === today ? 'Today' : formatCalendarDate(d, 'EEE d')}</Link>)}
        </nav>
        {!sessions.length ? <p className="rp-empty">No registers due {date === today ? 'today' : 'on this day'} for your classes.</p> : (
          <ul className="rp-list">
            {sessions.map((c) => (
              <li key={`${c.classId}-${c.start}`}><Link className="tap" href={`/teacher/register/${c.classId}?date=${date}&time=${c.start}`}>
                <span className="t">{c.className}{c.subject ? ` · ${c.subject}` : ''}</span>
                <span className="v"><Chip colour={c.taken ? 'var(--color-ok)' : 'var(--ra-blue)'}>{c.taken ? 'Taken' : 'To take'}</Chip></span>
                <span className="m">{c.start} to {c.end} · {c.students === 1 ? '1 student' : `${c.students} students`}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
