import { inArray } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { Icon } from '@/components/Icon';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { yearAndClasses } from '../students/year-classes';

export const metadata = { title: 'Classes' };
const COLOURS = ['var(--ra-indigo)', 'var(--ra-blue)', 'var(--ra-violet)', 'var(--ra-sky)', 'var(--ra-lav)'];
const ORDERS = { custom: 'Custom order', name: 'Order by name', size: 'Order by size', gender: 'Order by teacher gender' } as const;

export default async function Classes({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const sort = (sp.sort && sp.sort in ORDERS ? sp.sort : 'custom') as keyof typeof ORDERS;
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 60);
  const { year, classes } = await yearAndClasses();
  const ids = classes.map((c) => c.c.mainTeacherId).filter((x): x is number => !!x);
  const genders = new Map(ids.length ? (await db.select({ id: teacher.id, gender: teacher.gender }).from(teacher).where(inArray(teacher.id, ids))).map((t) => [t.id, t.gender]) : []);
  const rows = classes.filter((c) => !q || `${c.c.name} ${c.teacher ?? ''} ${c.yearGroup ?? ''}`.toLowerCase().includes(q)).sort((a, b) =>
    sort === 'name' ? a.c.name.localeCompare(b.c.name) : sort === 'size' ? b.students - a.students
      : sort === 'gender' ? (genders.get(a.c.mainTeacherId ?? 0) ?? 'zz').localeCompare(genders.get(b.c.mainTeacherId ?? 0) ?? 'zz') || a.c.name.localeCompare(b.c.name)
        : a.c.sortOrder - b.c.sortOrder || a.c.name.localeCompare(b.c.name));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Classes</h1><p>Year groups, teachers and sizes{year ? ` for ${year.title}` : ''}</p></div>
        <div className="ra-toolbar">
          <form action="/admin/classes" style={{ display: 'contents' }}>
            {q && <input type="hidden" name="q" value={q} />}
            <select className="ra-select" name="sort" defaultValue={sort} aria-label="Order classes">{Object.entries(ORDERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button className="ra-btn">Sort</button>
          </form>
          {adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/classes/new"><Icon name="plus" />Add class</Link>}
          <Link className="ra-btn" href="/admin/classes/timetable">Timetable</Link>
          <Link className="ra-btn" href="/admin/classes/print">Class PDFs</Link>
        </div></div>
      <div className="ra-more">
        <span className="ra-more-l">More tools</span>
        {[['/admin/students/move', 'Move students'], ['/admin/classes/rename', 'Switch/rename classes'], ['/admin/classes/timetable#copy', 'Duplicate class timings'], ['/admin/classes/rooms', 'Classrooms & subjects'],
          ['/admin/settings/schoolDays', 'School days'], ['/admin/classes/maintenance', 'Maintenance'], ['/admin/import/classes', 'Import classes']].map(([h, l]) => <Link key={h} className="ra-btn" href={h!}>{l}</Link>)}
      </div>
      <form className="ra-toolbar" role="search" action="/admin/classes">
        <input type="hidden" name="sort" value={sort} />
        <input className="ra-input grow" type="search" name="q" defaultValue={q} placeholder="Quick filter: class, teacher or age group" aria-label="Filter classes" style={{ maxWidth: 340 }} />
        <button className="ra-btn">Filter</button>
      </form>
      {!year ? <p className="ra-empty">Add an academic year first.</p> : rows.length === 0 ? <p className="ra-empty">{q ? 'No classes match.' : 'No classes set up for this year yet.'}</p> : (
        <div className="ra-class-grid">
          {rows.map((r, i) => {
            const cap = r.c.capacity ?? 0;
            const over = cap > 0 && r.students > cap;
            return (
              <article key={r.c.id} className="ra-class" style={{ ['--c' as string]: COLOURS[i % COLOURS.length] }}>
                <div className="ra-class-h"><h3><i /><Link href={`/admin/classes/${r.c.id}`}>{r.c.name}</Link></h3></div>
                <div className="ra-class-row"><span>Age group</span><span>{r.yearGroup ?? '—'}</span></div>
                <div className="ra-class-row"><span>Main teacher</span><span className={r.teacher ? undefined : 'ra-warn'}>{r.teacher ?? 'Not assigned'}</span></div>
                <div className="ra-class-row"><span>Students</span><span className={over ? 'ra-warn' : undefined}>{cap ? `${r.students} of ${cap}${over ? ` · ${r.students - cap} over` : ''}` : `${plural(r.students, 'student')} · no capacity set`}</span></div>
                <div className={`ra-bar${over ? ' over' : ''}`} role="img" aria-label={cap ? `${r.students} of ${cap} places filled` : 'No capacity set'}><i style={{ width: `${cap ? Math.min(100, (r.students / cap) * 100) : 0}%` }} /></div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
