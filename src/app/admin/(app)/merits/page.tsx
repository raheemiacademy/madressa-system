import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listAwards, listMerits } from '@/server/learning/merits';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../students/year-classes';
import { awardAction, deleteAwardsAction } from './actions';
import { MeritTabs } from './MeritTabs';
import { PeoplePicker } from './PeoplePicker';
import { rostersFor } from './rosters';

export const metadata = { title: 'Merits' };
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

/** §18 "Award Merits Now" and merits awarded, filtered by class, teacher, merit or dates. */
export default async function Merits({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const { options } = await yearAndClasses();
  const [merits, teachers, awards, rosters] = await Promise.all([
    listMerits(db), db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    listAwards(db, { classId: Number(sp.class) || undefined, teacherId: Number(sp.teacher) || undefined, meritId: Number(sp.merit) || undefined, from: date(sp.from), to: date(sp.to) }), rostersFor(options)
  ]);
  const enabled = merits.filter((m) => m.enabled);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Merits &amp; shop</h1><p>Reward students and teachers, mark milestones with certificates, and run the school shop</p></div></div>
      <MeritTabs current="/admin/merits" />
      {canEdit && (enabled.length === 0 ? <p className="ra-empty">Add a merit on the Merits tab to start awarding.</p> : (
        <Form action={awardAction} submit="Award merits now" resetOnSuccess>
          <div className="ra-card-h"><div><h2>Award merits now</h2></div></div>
          <div className="ra-fields">
            <SelectField name="meritId" label="Merit" options={enabled.map((m) => ({ value: String(m.id), label: `${m.name} (${m.points > 0 ? '+' : ''}${m.points})` }))} />
            <TextField name="awardedOn" label="Date" type="date" defaultValue={todayIso()} />
            <TextField name="comment" label="Comment" />
          </div>
          {options.length > 0 && <PeoplePicker name="studentIds" classes={options} rosters={rosters} />}
          {enabled.some((m) => m.forTeachers) && <details><summary className="ra-link" style={{ display: 'inline-grid' }}>Or teachers</summary><Checks name="teacherIds" legend="Teachers" options={teachers.map((t) => ({ value: String(t.id), label: t.name }))} /></details>}
        </Form>
      ))}
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field"><label htmlFor="aw-class">Class</label><select className="ra-select" id="aw-class" name="class" defaultValue={sp.class ?? ''}><option value="">All</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="aw-teacher">Teacher</label><select className="ra-select" id="aw-teacher" name="teacher" defaultValue={sp.teacher ?? ''}><option value="">Any</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="aw-merit">Merit</label><select className="ra-select" id="aw-merit" name="merit" defaultValue={sp.merit ?? ''}><option value="">Any</option>{merits.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="aw-from">From</label><input className="ra-input" id="aw-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="aw-to">To</label><input className="ra-input" id="aw-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
        <button className="ra-btn">Filter</button>
      </form>
      <section className="ra-card" aria-label="Merits awarded">
        {awards.length === 0 ? <p className="ra-empty">No merits awarded yet.</p> : (
          <Form action={deleteAwardsAction} card={false} savebar={false} submit="Delete selected">
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 600 }}><table className="ra-table">
              <thead><tr>{adminCan(admin.staff, 'delete') && <th><span className="sr-only">Select</span></th>}<th>#</th><th>Date</th><th>To</th><th>Merit</th><th>Class</th><th>Comment</th><th>Added by</th><th className="num">Points</th></tr></thead>
              <tbody>{awards.map((a) => (
                <tr key={a.a.id}>{adminCan(admin.staff, 'delete') && <td><input type="checkbox" name="ids" value={a.a.id} aria-label={`Select award #${a.a.id}`} /></td>}
                  <td className="ra-muted">{a.a.id}</td><td>{formatCalendarDate(a.a.awardedOn)}</td><td className="wrap">{a.to}</td><td>{a.meritName}</td><td>{a.className ?? ''}</td><td className="wrap">{a.a.comment ?? ''}</td><td>{a.a.awardedBy}</td>
                  <td className="num">{a.a.points > 0 ? `+${a.a.points}` : a.a.points}</td></tr>
              ))}</tbody>
            </table></div>
          </Form>
        )}
      </section>
    </div>
  );
}
