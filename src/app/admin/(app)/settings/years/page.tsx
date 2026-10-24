import { db } from '@/db';
import { formatCalendarDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { listYears } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { YearForm } from './YearForm';
import { YearRowActions } from './YearRowActions';

export const metadata = { title: 'Academic years' };

export default async function YearsPage() {
  await requireAdmin('super');
  const years = await listYears(db);
  return (
    <>
      <section className="ra-card" aria-labelledby="years-h">
        <div className="ra-card-h"><div><h2 id="years-h">Academic years</h2><div className="ra-note">{years.length ? plural(years.length, 'year') : 'Add the first year below'}. The current year is what every page shows by default.</div></div></div>
        {years.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}>
            <table className="ra-table">
              <thead><tr><th>Title</th><th>Starts</th><th>Ends</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.id}>
                    <td className="wrap">{y.title}</td>
                    <td>{formatCalendarDate(y.startsOn)}</td>
                    <td>{formatCalendarDate(y.endsOn)}</td>
                    <td>{y.isCurrent ? <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-ok)' }}><span>Current</span></span> : ''}</td>
                    <td><YearRowActions id={y.id} title={y.title} isCurrent={y.isCurrent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <YearForm />
    </>
  );
}
