import { cookies } from 'next/headers';
import Link from 'next/link';
import { db } from '@/db';
import { formatCalendarDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { resolveYear } from '@/server/academic-years';
import { listHolidays } from '@/server/holidays';
import { requireAdmin } from '@/server/next/actor';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { ActionButton } from '@/components/Form';
import { holidayNewsletterAction } from '../../newsletters/actions';
import { DeleteHoliday, HolidayForm } from './HolidayForm';
import { holidayClassNames } from '@/server/people/extras';
import { listClasses } from '@/server/people/classes';

export const metadata = { title: 'Calendar & holidays' };

const yesNo = (parts: [boolean, string][]) => parts.filter(([on]) => on).map(([, l]) => l).join(', ');

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin('super');
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  if (!year) return <div className="ra-card"><p className="ra-empty">Add an academic year first, then you can add its holidays. <Link href="/admin/settings/years">Academic years</Link></p></div>;
  const hols = await listHolidays(db, year.id);
  const [hc, classes] = await Promise.all([holidayClassNames(db, hols.map((h) => h.id)), listClasses(db, year.id)]);
  const appliesTo = (h: (typeof hols)[number]) => h.allClasses ? 'All classes' : hc.filter((x) => x.holidayId === h.id).map((x) => x.name).join(', ');
  const editId = Number((await searchParams).edit);
  const editing = hols.find((h) => h.id === editId);
  return (
    <>
      <section className="ra-card" aria-labelledby="hol-h">
        <div className="ra-card-h">
          <div><h2 id="hol-h">Holidays in {year.title}</h2><div className="ra-note">{hols.length ? plural(hols.length, 'holiday') : 'None yet'}. Use the year switcher at the top to see another year.</div></div>
          <div className="ra-toolbar no-print"><Link className="ra-btn" href={`/admin/settings/years/${year.id}/calendar`}>Year calendar</Link><PrintButton /><ActionButton action={holidayNewsletterAction} label="Send holidays newsletter" /></div>
        </div>
        {hols.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}>
            <table className="ra-table">
              <thead><tr><th>Holiday</th><th>Dates</th><th className="opt">Shown on</th><th className="opt">Still attending</th><th className="opt">Classes</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {hols.map((h) => (
                  <tr key={h.id}>
                    <td className="wrap">{h.title}{h.description && <div className="ra-note">{h.description}</div>}</td>
                    <td>{h.startsOn === h.endsOn ? formatCalendarDate(h.startsOn) : `${formatCalendarDate(h.startsOn)} – ${formatCalendarDate(h.endsOn)}`}</td>
                    <td className="opt wrap">{yesNo([[h.showTeacher, 'Teachers'], [h.showParent, 'Parents'], [h.showStudent, 'Students']])}</td>
                    <td className="opt wrap">{yesNo([[h.studentsAttend, 'Students'], [h.teachersAttend, 'Teachers']]) || 'Nobody'}</td><td className="opt wrap">{appliesTo(h)}</td>
                    <td><span className="ra-acts no-print"><Link href={`/admin/settings/holidays?edit=${h.id}`} aria-label={`Edit ${h.title}`}><Icon name="edit" /></Link><DeleteHoliday id={h.id} title={h.title} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="no-print"><HolidayForm key={editing?.id ?? 'new'} yearId={year.id} yearTitle={year.title} holiday={editing} classes={classes.map((c) => ({ value: String(c.c.id), label: c.c.name }))} chosen={editing ? hc.filter((x) => x.holidayId === editing.id).map((x) => String(x.classId)) : []} /></div>
    </>
  );
}
