import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { schoolClass, student } from '@/db/schema';
import { MonthChart } from '@/components/charts';
import { classify, LETTER_NAMES, letter, pct1, summarise } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { addDays, codeMap, marksBetween } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';

export const metadata = { title: 'Attendance record' };

/** Student attendance record (§6 mode=student-record): monthly table, 12-month chart, daily monitor and totals. */
export default async function StudentRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [s] = Number.isInteger(id) ? await db.select().from(student).where(eq(student.id, id)) : [];
  if (!s) notFound();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '') ? sp.to! : todayIso();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '') && sp.from! <= to ? sp.from! : `${addDays(to, -365).slice(0, 7)}-01`;
  const [marks, codes, classes] = await Promise.all([marksBetween(db, from, to, { studentId: id }), codeMap(db), db.select({ id: schoolClass.id, name: schoolClass.name }).from(schoolClass)]);
  const months = [...new Set(marks.map((m) => m.date.slice(0, 7)))].sort();
  const perMonth = months.map((m) => ({ month: m, s: summarise(marks.filter((x) => x.date.startsWith(m)), codes) }));
  const total = summarise(marks, codes);
  const chart = perMonth.slice(-12).map(({ month, s }) => ({ month, present: s.present, late: s.late, authorised: s.absentAuthorised, unauthorised: s.absentUnauthorised + s.absentUnspecified }));
  const cell = (k: string, v: React.ReactNode) => <div className="ra-kpi" style={{ padding: 12 }}><div className="ra-kpi-top">{k}</div><div style={{ fontSize: 20, fontWeight: 600 }}>{v}</div></div>;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{s.firstName} {s.surname}</h1><p>Attendance record · {formatCalendarDate(from)} to {formatCalendarDate(to)}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/students/${id}`}>Student profile</Link><Link className="ra-btn" href={`/admin/register/absent?student=${id}`}>Mark absent</Link></div></div>
      <form className="ra-card ra-toolbar" action={`/admin/register/student/${id}`}>
        <div className="ra-field"><label htmlFor="sr-f">From</label><input className="ra-input" id="sr-f" type="date" name="from" defaultValue={from} /></div>
        <div className="ra-field"><label htmlFor="sr-t">To</label><input className="ra-input" id="sr-t" type="date" name="to" defaultValue={to} /></div>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Show</button>
      </form>
      <div className="ra-kpis">
        {cell('Attendance', pct1(total.standardPct))}{cell('Strict', pct1(total.strictPct))}{cell('Sessions', total.sessions)}{cell('Present', total.present)}
        {cell('Absent', `${total.absent} (${total.absentAuthorised} authorised, ${total.absentUnauthorised + total.absentUnspecified} not)`)}
        {cell('Late', `${total.late} · ${total.lateMinutes} min`)}{cell('Left early', `${total.leftEarly} · ${total.leftEarlyMinutes} min`)}{cell('Minutes missed', total.lateMinutes + total.leftEarlyMinutes)}
        {cell('Late authorised / not', `${total.lateAuthorised} / ${total.lateUnauthorised}`)}{cell('Notified', total.notified)}
      </div>
      <section className="ra-card" aria-labelledby="ch-h"><div className="ra-card-h"><div><h2 id="ch-h">12 months</h2></div></div><MonthChart data={chart} /></section>
      <section className="ra-card" aria-labelledby="pm-h">
        <div className="ra-card-h"><div><h2 id="pm-h">By month</h2></div></div>
        {perMonth.length === 0 ? <p className="ra-empty">No register entries in this period.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Month</th><th className="num">Sessions</th><th className="num">Absent</th><th className="num opt">Authorised</th><th className="num opt">Unauthorised</th><th className="num">Late</th><th className="num opt">Minutes</th><th className="num opt">Left early</th><th className="num">Standard %</th><th className="num opt">Strict %</th></tr></thead>
            <tbody>{perMonth.map(({ month, s: m }) => (
              <tr key={month}><td>{new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td>
                <td className="num">{m.sessions}</td><td className="num">{m.absent}</td><td className="num opt">{m.absentAuthorised}</td><td className="num opt">{m.absentUnauthorised + m.absentUnspecified}</td>
                <td className="num">{m.late}</td><td className="num opt">{m.lateMinutes}</td><td className="num opt">{m.leftEarly}</td><td className="num">{pct1(m.standardPct)}</td><td className="num opt">{pct1(m.strictPct)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="ra-card" aria-labelledby="dm-h">
        <div className="ra-card-h"><div><h2 id="dm-h">Daily monitor</h2><div className="ra-note">Every register entry, newest first.</div></div></div>
        {marks.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Date</th><th>Time</th><th className="opt">Class</th><th>Status</th><th>Authorisation</th><th>Note</th></tr></thead>
            <tbody>{[...marks].reverse().map((m) => {
              const c = classify(m, codes);
              const l = letter(m, codes);
              return (
                <tr key={m.id}><td>{formatCalendarDate(m.date, 'EEE dd/MM/yyyy')}</td><td>{m.startTime.slice(0, 5)}</td><td className="opt wrap">{classes.find((x) => x.id === m.classId)?.name}</td>
                  <td>{LETTER_NAMES[l] ?? l}{m.lateMinutes ? ` (${m.lateMinutes} min)` : ''}</td>
                  <td>{(c.absent || c.late) ? (m.authorised === null && !m.code ? <>Authorisation unspecified · <Link href={`/admin/register/daily?class=${m.classId}&month=${m.date.slice(0, 7)}`}>Add</Link></> : c.authorised ? 'Authorised' : 'Unauthorised') : ''}</td>
                  <td className="wrap">{m.note ?? ''}</td></tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
