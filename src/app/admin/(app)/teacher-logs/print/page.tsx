import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { teacher, teacherLog } from '@/db/schema';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { activeTeachers } from '@/server/attendance/teacher-logs';
import { todayIso } from '@/server/people/common';
import { getProfile } from '@/server/profile';

export const metadata = { title: 'Print teacher logs' };

export default async function PrintLogs({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; t?: string | string[] }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const iso = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v! : todayIso());
  const from = iso(sp.from), to = iso(sp.to);
  const chosen = (Array.isArray(sp.t) ? sp.t : sp.t ? [sp.t] : []).map(Number).filter(Boolean);
  const [teachers, school] = await Promise.all([activeTeachers(db), getProfile(db)]);
  const rows = await db.select({ l: teacherLog, name: teacher.name }).from(teacherLog).innerJoin(teacher, eq(teacher.id, teacherLog.teacherId))
    .where(and(gte(teacherLog.date, from), lte(teacherLog.date, to), chosen.length ? inArray(teacherLog.teacherId, chosen) : undefined)).orderBy(asc(teacher.name), asc(teacherLog.date));
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>Print teacher logs</h1></div></div>
      <form className="ra-card ra-form no-print" action="/admin/teacher-logs/print">
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="pl-f">From</label><input className="ra-input" id="pl-f" type="date" name="from" defaultValue={from} /></div>
          <div className="ra-field"><label htmlFor="pl-t">To</label><input className="ra-input" id="pl-t" type="date" name="to" defaultValue={to} /></div>
        </div>
        <fieldset className="ra-fieldset"><legend>Teachers (none ticked = all)</legend><div className="ra-checks">{teachers.map((x) => <label key={x.id} className="ra-check"><input type="checkbox" name="t" value={x.id} defaultChecked={chosen.includes(x.id)} /><span>{x.name}</span></label>)}</div></fieldset>
        <div className="ra-toolbar"><button className="ra-btn">Show</button><PrintButton label="Print or save as PDF" /></div>
      </form>
      <section className="ra-card">
        <div className="ra-card-h"><div><h2>Teacher logs · {formatCalendarDate(from)} to {formatCalendarDate(to)}</h2><div className="ra-note">{school?.name}</div></div></div>
        {rows.length === 0 ? <p className="ra-empty">No logs in these dates.</p> : (
          <table className="ra-table"><thead><tr><th>Teacher</th><th>Date</th><th>Time in</th><th>Time out</th><th>Absent</th><th>Note</th></tr></thead>
            <tbody>{rows.map(({ l, name }) => <tr key={l.id}><td className="wrap">{name}</td><td>{formatCalendarDate(l.date)}</td><td>{l.timeIn?.slice(0, 5) ?? ''}</td><td>{l.timeOut?.slice(0, 5) ?? ''}</td><td>{l.absent ? 'Yes' : ''}</td><td className="wrap">{l.note ?? ''}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
