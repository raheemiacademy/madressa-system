import Link from 'next/link';
import { db } from '@/db';
import { Checks, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { allHours, listTeachers } from '@/server/people/teachers';
import { hoursAction } from '../actions';

export const metadata = { title: 'Working hours' };
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']] as const;

export default async function Hours({ searchParams }: { searchParams: Promise<{ teacher?: string }> }) {
  const admin = await requireAdmin();
  const one = Number((await searchParams).teacher) || null;
  const [teachers, hours] = await Promise.all([listTeachers(db), allHours(db)]);
  const of = (t: number, d: number) => hours.find((h) => h.teacherId === t && h.weekday === d);
  const editing = teachers.find((t) => t.id === one);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Working hours</h1><p>Each teacher’s weekly start and finish times.</p></div><div className="ra-toolbar"><Link className="ra-btn" href="/admin/teachers">Teachers</Link></div></div>
      <section className="ra-card">
        {teachers.length === 0 ? <p className="ra-empty">No teachers yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Teacher</th>{DAYS.map(([, l]) => <th key={l}>{l}</th>)}<th><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>{teachers.map((t) => (
              <tr key={t.id}><td className="wrap">{t.name}</td>
                {DAYS.map(([d]) => { const h = of(t.id, d); return <td key={d}>{h ? `${h.startTime.slice(0, 5)}–${h.endTime.slice(0, 5)}` : ''}</td>; })}
                <td>{canEdit && <Link className="ra-link" href={`?teacher=${t.id}`}>Edit</Link>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {canEdit && editing && (
        <Form action={hoursAction} submit="Save hours" key={editing.id}>
          <div className="ra-card-h"><div><h2>{editing.name}</h2><div className="ra-note">Leave both times blank for days they don’t work.</div></div></div>
          <input type="hidden" name="teacherIds" value={editing.id} />
          <div className="ra-fields">
            {DAYS.map(([d, l]) => { const h = of(editing.id, d); return (
              <fieldset key={d} className="ra-fieldset"><legend>{l}</legend>
                <div className="ra-fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <TextField id={`s${d}`} name={`start.${d}`} label="Start" type="time" defaultValue={h?.startTime.slice(0, 5) ?? ''} />
                  <TextField id={`e${d}`} name={`end.${d}`} label="Finish" type="time" defaultValue={h?.endTime.slice(0, 5) ?? ''} />
                </div>
              </fieldset>
            ); })}
          </div>
        </Form>
      )}
      {canEdit && teachers.length > 0 && (
        <Form action={hoursAction} submit="Apply to chosen teachers">
          <div className="ra-card-h"><div><h2>Bulk change</h2><div className="ra-note">Set the same times for several teachers on the chosen days. Blank times mean not working.</div></div></div>
          <Checks name="teacherIds" legend="Teachers" options={teachers.map((t) => ({ value: String(t.id), label: t.name }))} />
          <Checks name="days" legend="Days" options={DAYS.map(([d, l]) => ({ value: String(d), label: l }))} />
          <div className="ra-fields"><TextField id="bulk-start" name="start" label="Start" type="time" /><TextField id="bulk-end" name="end" label="Finish" type="time" /></div>
        </Form>
      )}
    </div>
  );
}
