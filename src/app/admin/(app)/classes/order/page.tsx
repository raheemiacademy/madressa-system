import { cookies } from 'next/headers';
import Link from 'next/link';
import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { resolveYear } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { listClasses } from '@/server/people/classes';
import { moveClassAction } from '../actions';

export const metadata = { title: 'Class order' };

/** Sets the Classes page's "Custom order" (also used by registers and class lists) with Move up / Move down. */
export default async function ClassOrder() {
  await requireAdmin('edit');
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  const rows = year ? await listClasses(db, year.id) : [];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Class order</h1><p>The order classes appear in when the Classes page is set to “Custom order”{year ? `, for ${year.title}` : ''}.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/classes?sort=custom">Done</Link></div></div>
      {rows.length === 0 ? <div className="ra-card"><p className="ra-empty">No classes set up for this year yet.</p></div> : (
        <ol className="ra-card ra-order" aria-label="Classes in order">
          {rows.map((r, i) => (
            <li key={r.c.id}>
              <span className="ra-order-n" aria-hidden="true">{i + 1}</span>
              <span className="ra-order-name"><b>{r.c.name}</b><small>{[r.yearGroup, r.teacher].filter(Boolean).join(' · ') || 'No age group or teacher'}</small></span>
              <span className="ra-acts">
                {i > 0 ? <ActionButton action={moveClassAction.bind(null, r.c.id, 'up')} className="ra-btn" ariaLabel={`Move ${r.c.name} up`}>↑</ActionButton> : <button type="button" className="ra-btn" disabled aria-label={`${r.c.name} is first`}>↑</button>}
                {i < rows.length - 1 ? <ActionButton action={moveClassAction.bind(null, r.c.id, 'down')} className="ra-btn" ariaLabel={`Move ${r.c.name} down`}>↓</ActionButton> : <button type="button" className="ra-btn" disabled aria-label={`${r.c.name} is last`}>↓</button>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
