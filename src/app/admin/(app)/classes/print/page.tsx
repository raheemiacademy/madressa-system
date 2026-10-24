import Link from 'next/link';
import { db } from '@/db';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { getClass } from '@/server/people/classes';
import { getProfile } from '@/server/profile';
import { yearAndClasses } from '../../students/year-classes';
import { SlotList } from '../SlotParts';

export const metadata = { title: 'Class PDFs' };

/** Basic Class Summary, Full Class Summary and All Classes, as print layouts (Save as PDF). */
export default async function ClassPrint({ searchParams }: { searchParams: Promise<{ class?: string; mode?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const mode = sp.mode === 'full' ? 'full' : sp.mode === 'all' ? 'all' : 'basic';
  const { year, classes, options } = await yearAndClasses();
  const school = await getProfile(db);
  const ids = mode === 'all' ? classes.map((c) => c.c.id) : Number(sp.class) ? [Number(sp.class)] : [];
  const detail = await Promise.all(ids.map((id) => getClass(db, id)));
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>Class PDFs</h1><p>Choose a summary, then print or save it as a PDF.</p></div></div>
      <form className="ra-card ra-toolbar no-print" action="/admin/classes/print">
        <div className="ra-field"><label htmlFor="pc">Class</label><select className="ra-select" id="pc" name="class" defaultValue={sp.class ?? ''}><option value="">Choose a class</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="pm">Summary</label><select className="ra-select" id="pm" name="mode" defaultValue={mode}><option value="basic">Basic class summary</option><option value="full">Full class summary</option><option value="all">All classes</option></select></div>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Show</button>
        {detail.length > 0 && <span style={{ alignSelf: 'end' }}><PrintButton label="Print or save as PDF" /></span>}
      </form>
      {mode === 'all' && detail.length > 0 && (
        <section className="ra-card">
          <div className="ra-card-h"><div><h2>All classes · {year?.title}</h2><div className="ra-note">{school?.name}</div></div></div>
          <table className="ra-table"><thead><tr><th>Class</th><th>Main teacher</th><th className="num">Students</th><th className="num">Capacity</th></tr></thead>
            <tbody>{classes.map((c) => <tr key={c.c.id}><td className="wrap">{c.c.name}</td><td className="wrap">{c.teacher ?? 'Not assigned'}</td><td className="num">{c.students}</td><td className="num">{c.c.capacity ?? ''}</td></tr>)}</tbody></table>
        </section>
      )}
      {mode !== 'all' && detail.map((c) => c && (
        <section key={c.id} className="ra-card ra-page-break">
          <div className="ra-card-h"><div><h2>{c.name} · {year?.title}</h2><div className="ra-note">{school?.name} · {c.students.length} students · teachers: {c.teachers.map((t) => t.name).join(', ') || 'none'}</div></div></div>
          <table className="ra-table"><thead><tr><th>#</th><th>Student</th>{mode === 'full' && <><th>Status</th><th>In class since</th></>}</tr></thead>
            <tbody>{c.students.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td className="wrap">{s.firstName} {s.surname}</td>{mode === 'full' && <><td>{s.status}</td><td>{formatCalendarDate(s.from)}</td></>}</tr>)}</tbody></table>
          {mode === 'full' && <><h3 style={{ margin: 0, fontSize: 14 }}>Timetable</h3><SlotList slots={c.slots} canEdit={false} /></>}
        </section>
      ))}
      <p className="ra-note no-print"><Link href="/admin/classes">Back to classes</Link></p>
    </div>
  );
}
