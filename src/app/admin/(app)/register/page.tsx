import Link from 'next/link';
import { db } from '@/db';
import { TrendChart } from '@/components/charts';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { pct1, summarise } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { addDays, codeMap, marksBetween, registerStatus, weeklyTrend } from '@/server/attendance/registers';
import { countNotices, countPendingRequests } from '@/server/attendance/requests';
import { todayIso } from '@/server/people/common';
import { globalSearch } from '@/server/people/search';
import { yearAndClasses } from '../students/year-classes';
import { RegisterGrid } from './RegisterGrid';

export const metadata = { title: 'Register' };
const RANGES = { yesterday: 'Yesterday', today: 'Today', week: 'Last 7 days' } as const;

export default async function Register({ searchParams }: { searchParams: Promise<{ range?: string; q?: string; class?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIso();
  const range = (sp.range && sp.range in RANGES ? sp.range : 'today') as keyof typeof RANGES;
  const { year, options } = await yearAndClasses();
  const days = range === 'today' ? [today] : range === 'yesterday' ? [addDays(today, -1)] : Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const monthStart = `${today.slice(0, 7)}-01`;
  const [statusByDay, notices, requests, trend, marks, codes, found] = await Promise.all([
    year ? Promise.all(days.map(async (d) => ({ date: d, rows: await registerStatus(db, year.id, d) }))) : Promise.resolve([]),
    countNotices(db, today), countPendingRequests(db),
    year ? weeklyTrend(db, year.startsOn, today) : Promise.resolve([]),
    marksBetween(db, monthStart, today), codeMap(db),
    sp.q ? globalSearch(db, sp.q, 10) : Promise.resolve(null)
  ]);
  const monthPct = (classId: number) => summarise(marks.filter((m) => m.classId === classId), codes).standardPct;
  const classId = Number(sp.class) || Number(options[0]?.value) || null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Register</h1><p>Daily registers, absences and authorisations</p></div>
        <div className="ra-toolbar">
          <Link className="ra-btn primary" href="/admin/register/absent">Mark students absent</Link>
          <Link className="ra-btn" href="/admin/register/authorise">Mass authorise</Link>
          <Link className="ra-btn" href="/admin/register/calendar">Absent calendar</Link>
          <Link className="ra-btn" href="/admin/register/download">Download register</Link>
        </div></div>

      {(notices > 0 || requests > 0) && (
        <div className="ra-banners">
          {notices > 0 && <div className="ra-banner" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div><b>{notices}</b> “will be absent / late today” {notices === 1 ? 'notice' : 'notices'} from parents</div><Link className="ra-link" href="/admin/register/notices">Open</Link></div>}
          {requests > 0 && <div className="ra-banner" style={{ ['--c' as string]: 'var(--ra-violet)' }}><div><b>{requests}</b> {requests === 1 ? 'holiday request' : 'holiday requests'} to accept, decline or ask about</div><Link className="ra-link" href="/admin/register/requests">Open</Link></div>}
        </div>
      )}

      {/* The two register views come first, on their own; the tools follow. */}
      <nav className="ra-views" aria-label="Register views">
        <Link className="ra-view tap" href="/admin/register/daily"><Icon name="check" /><span><b>Daily register</b><small>Each class, week by week</small></span></Link>
        <Link className="ra-view tap" href="/admin/register/monthly"><Icon name="calendar" /><span><b>Monthly register</b><small>The whole month at a glance</small></span></Link>
      </nav>

      <div className="ra-more">
        <span className="ra-more-l">More tools</span>
        {[['/admin/register/stats', 'Attendance stats'], ['/admin/register/summary', 'Daily summary'],
          ['/admin/register/requests', 'Holiday requests'], ['/admin/register/notices', 'Parent notices'], ['/admin/register/alerts', 'Attendance alerts'], ['/admin/register/doubles', 'Double entries'],
          ['/admin/register/delete', 'Delete register entries'], ['/admin/settings/attendance-codes', 'Attendance codes']].map(([h, l]) => <Link key={h} className="ra-btn" href={h!}>{l}</Link>)}
      </div>

      <div className="ra-grid">
        <section className="ra-card ra-c5" aria-labelledby="rt-h">
          <div className="ra-card-h"><div><h2 id="rt-h">{range === 'today' ? 'Today’s registers' : `Registers: ${RANGES[range].toLowerCase()}`}</h2><div className="ra-note">Complete or still to be taken, with month-to-date attendance</div></div></div>
          <nav className="ra-filters" aria-label="Query daily register">{Object.entries(RANGES).map(([k, l]) => <Link key={k} className="ra-filter" href={`?range=${k}`} aria-current={range === k ? 'page' : undefined}>{l}</Link>)}</nav>
          {statusByDay.map(({ date, rows }) => {
            const due = rows.filter((r) => r.expected);
            return (
              <div key={date}>
                {range !== 'today' && <h3 style={{ margin: '4px 0', fontSize: 13 }}>{formatCalendarDate(date, 'EEE d MMM')}</h3>}
                {due.length === 0 ? <p className="ra-empty">No registers due.</p> : (
                  <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
                    <thead><tr><th>Class</th><th>Register</th><th className="num">Attendance</th></tr></thead>
                    <tbody>{due.map((r) => (
                      <tr key={r.classId}>
                        <td className="wrap"><Link href={`/admin/register/take?class=${r.classId}&date=${date}&time=${r.sessions[r.taken < r.expected ? r.taken : 0]?.startTime.slice(0, 5) ?? ''}`}>{r.name}</Link></td>
                        <td><Chip colour={r.status === 'Complete' ? 'var(--color-ok)' : 'var(--color-bad)'}>{r.status}</Chip></td>
                        <td className="num">{pct1(monthPct(r.classId))}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
            );
          })}
          {!year && <p className="ra-empty">Add an academic year first.</p>}
        </section>

        <section className="ra-card ra-c7" aria-labelledby="dg-h">
          <RegisterGrid classOptions={options} classId={classId} month={today.slice(0, 7)} headingId="dg-h" compact />
        </section>

        <section className="ra-card ra-c12" aria-labelledby="tr-h">
          <div className="ra-card-h"><div><h2 id="tr-h">Attendance trend</h2><div className="ra-note">Whole school, weekly, this year</div></div></div>
          <TrendChart data={trend} />
        </section>

        <section className="ra-card ra-c12" aria-labelledby="qs-h">
          <div className="ra-card-h"><div><h2 id="qs-h">Query student attendance</h2></div></div>
          <form className="ra-toolbar" role="search" action="/admin/register">
            <input className="ra-input grow" type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Student name or #ID" aria-label="Find a student’s attendance" style={{ maxWidth: 340 }} />
            <button className="ra-btn"><Icon name="search" />Find</button>
          </form>
          {found && (found.students.length === 0 ? <p className="ra-empty" role="status">No students match.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>{found.students.map((s) => <li key={s.id}><Link href={`/admin/register/student/${s.id}`}>{s.firstName} {s.surname}</Link> <span className="ra-muted">#{s.id} · {s.status}</span></li>)}</ul>
          ))}
          {found && <p className="ra-note">{plural(found.students.length, 'student')} found.</p>}
        </section>
      </div>
    </div>
  );
}
