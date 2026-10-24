import { and, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { teacherHours, teacherLog } from '@/db/schema';
import { requireAdmin } from '@/server/next/actor';
import { datesBetween, weekdayOf } from '@/server/attendance/registers';
import { activeTeachers } from '@/server/attendance/teacher-logs';
import { todayIso } from '@/server/people/common';
import { LogRows } from '../LogRows';

export const metadata = { title: 'Add teacher logs' };
const t = (v: string | null | undefined) => v?.slice(0, 5) ?? '';

/** Generate a log form for chosen teachers and dates, optionally pre-filled from their working hours. */
export default async function AddLogs({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; prefill?: string; t?: string | string[] }> }) {
  await requireAdmin('edit');
  const sp = await searchParams;
  const iso = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v! : todayIso());
  const from = iso(sp.from), to = iso(sp.to) < from ? from : iso(sp.to);
  const chosen = (Array.isArray(sp.t) ? sp.t : sp.t ? [sp.t] : []).map(Number).filter(Boolean);
  const teachers = await activeTeachers(db);
  const days = datesBetween(from, to).slice(0, 31);
  const picked = teachers.filter((x) => chosen.includes(x.id));
  const [hours, logs] = picked.length ? await Promise.all([
    db.select().from(teacherHours).where(inArray(teacherHours.teacherId, chosen)),
    db.select().from(teacherLog).where(and(inArray(teacherLog.teacherId, chosen), gte(teacherLog.date, from), lte(teacherLog.date, to)))
  ]) : [[], []];
  const rows = picked.flatMap((p) => days.flatMap((d) => {
    const h = hours.find((x) => x.teacherId === p.id && x.weekday === weekdayOf(d));
    const l = logs.find((x) => x.teacherId === p.id && x.date === d);
    if (!h && !l && sp.prefill === '1') return [];
    return [{ teacherId: p.id, name: p.name, date: d, timeIn: t(l?.timeIn) || (sp.prefill === '1' ? t(h?.startTime) : ''), timeOut: t(l?.timeOut) || (sp.prefill === '1' ? t(h?.endTime) : ''), absent: !!l?.absent, note: l?.note ?? '', expected: h ? `${t(h.startTime)}–${t(h.endTime)}` : '' }];
  }));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Add teacher logs</h1><p>Choose teachers and dates (up to 31 days), then fill in the form.</p></div></div>
      <form className="ra-card ra-form" action="/admin/teacher-logs/add">
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="al-f">From</label><input className="ra-input" id="al-f" type="date" name="from" defaultValue={from} /></div>
          <div className="ra-field"><label htmlFor="al-t">To</label><input className="ra-input" id="al-t" type="date" name="to" defaultValue={to} /></div>
        </div>
        <fieldset className="ra-fieldset"><legend>Teachers</legend><div className="ra-checks">
          {teachers.map((x) => <label key={x.id} className="ra-check"><input type="checkbox" name="t" value={x.id} defaultChecked={chosen.includes(x.id)} /><span>{x.name}</span></label>)}
        </div></fieldset>
        <label className="ra-check"><input type="checkbox" name="prefill" value="1" defaultChecked={sp.prefill === '1'} /><span>Pre-fill times from working hours (only days they work)</span></label>
        <div className="ra-toolbar"><button className="ra-btn">Generate form</button></div>
      </form>
      {picked.length > 0 && <section className="ra-card"><LogRows rows={rows} /></section>}
    </div>
  );
}
