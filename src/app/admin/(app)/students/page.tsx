import { and, eq, gte, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { db } from '@/db';
import { loginIdentity, STUDENT_STATUSES } from '@/db/schema';
import { Icon } from '@/components/Icon';
import { plural } from '@/lib/text';
import { resolveYear } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listClasses } from '@/server/people/classes';
import { countsByAge, listFilters, listStudents } from '@/server/people/students';
import { readTab } from '@/server/settings';
import { StudentsTable } from './StudentsTable';

export const metadata = { title: 'Students' };

const TOOLS: [string, string][] = [
  ['/admin/students/move', 'Move student classes'], ['/admin/students/portal-access', 'Parent portal access'], ['/admin/students/download', 'Download students'],
  ['/admin/students/walk-home', 'Walk-home consents'], ['/admin/import/students', 'Import students'], ['/admin/import/students?edit=1', 'Export/import edit'],
  ['/admin/students/registration', 'Registration pages'], ['/admin/students/siblings', 'Manage siblings'], ['/admin/contacts', 'Manage contacts'],
  ['/admin/students/data-forms', 'Data update forms'], ['/admin/students/duplicates', 'Find duplicate students'], ['/admin/students/multi-class', 'Multiple class students']
];

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const f = listFilters.parse(sp);
  const [{ year }, prefs] = await Promise.all([resolveYear(db, Number((await cookies()).get('year_id')?.value) || null), readTab(db, 'preferences')]);
  const perPage = Number(prefs.studentsPerPage) || 50;
  const [list, byAge, classes, [portal]] = await Promise.all([
    listStudents(db, f, perPage), countsByAge(db), year ? listClasses(db, year.id) : [],
    db.select({ n: sql<number>`count(*)::int` }).from(loginIdentity).where(and(eq(loginIdentity.portal, 'parent'), year ? gte(loginIdentity.lastLoginAt, new Date(`${year.startsOn}T00:00:00Z`)) : undefined))
  ]);
  const totals = byAge.reduce((t, r) => ({ current: t.current + r.current, waiting: t.waiting + r.waiting }), { current: 0, waiting: 0 });
  const pages = Math.max(1, Math.ceil(list.total / perPage));
  const qs = (o: Record<string, string | number | undefined>) => '?' + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v !== undefined && v !== '' && v !== 'All').map(([k, v]) => [k, String(v)])).toString();
  const filtered = !!(f.q || f.status !== 'All' || f.classId || f.leftFrom || f.leftTo || f.startFrom || f.startTo || f.medical);
  const allCount = list.statusCounts.reduce((s, r) => s + r.n, 0);
  const canEdit = adminCan(admin.staff, 'edit');

  return (
    <div className="ra-page">
      <div className="ra-page-h">
        <div><h1>Students</h1><p>Records, classes, contacts and status</p></div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href="/admin/students/new"><Icon name="plus" />Add student</Link>}
          <Link className="ra-btn" href="/admin/import/students">Import</Link>
          <Link className="ra-btn" href="/admin/students/download">Download</Link>
          <Link className="ra-btn" href="/admin/students/move">Move classes</Link>
        </div>
      </div>

      <div className="ra-kpis">
        <div className="ra-kpi" style={{ ['--c' as string]: 'var(--ra-indigo)' }}><div className="ra-kpi-top">Current</div><div className="ra-kpi-val">{totals.current.toLocaleString('en-GB')}</div><div className="ra-kpi-sub">Enrolled and attending</div></div>
        <div className="ra-kpi" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div className="ra-kpi-top">Waiting list</div><div className="ra-kpi-val">{totals.waiting.toLocaleString('en-GB')}</div><div className="ra-kpi-sub">From the application form</div></div>
        <div className="ra-kpi" style={{ ['--c' as string]: 'var(--ra-sky)' }}><div className="ra-kpi-top">Parents on portal</div><div className="ra-kpi-val">{(portal?.n ?? 0).toLocaleString('en-GB')}</div><div className="ra-kpi-sub">Logged in this year</div></div>
      </div>

      <div className="ra-more">
        <span className="ra-more-l">More tools</span>
        {TOOLS.map(([href, label]) => <Link key={href} className="ra-btn" href={href}>{label}</Link>)}
      </div>

      <div className="ra-grid">
        <section className="ra-card ra-c4" aria-labelledby="age-h">
          <div className="ra-card-h"><div><h2 id="age-h">By age group</h2><div className="ra-note">Current and waiting list</div></div></div>
          {byAge.length === 0 ? <p className="ra-empty">No current or waiting students yet.</p> : (
            <table className="ra-table">
              <thead><tr><th>Group</th><th className="num">Current</th><th className="num">Waiting</th></tr></thead>
              <tbody>{byAge.map((r) => <tr key={r.label}><td className="wrap">{r.label}</td><td className="num">{r.current}</td><td className="num">{r.waiting}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section className="ra-card ra-c8" aria-labelledby="ms-h">
          <div className="ra-card-h"><div><h2 id="ms-h">Manage students</h2><div className="ra-note">{plural(list.total, 'student')}{filtered ? ' match' : ''}</div></div></div>
          <form className="ra-toolbar" role="search" action="/admin/students">
            <input className="ra-input grow" type="search" name="q" defaultValue={f.q} placeholder="Search name, ID or class" aria-label="Search students" style={{ maxWidth: 340 }} />
            {f.status !== 'All' && <input type="hidden" name="status" value={f.status} />}
            <button className="ra-btn">Search</button>
          </form>
          <nav className="ra-filters" aria-label="Filter by status">
            <Link className="ra-filter" href={qs({ status: undefined, page: undefined })} aria-current={f.status === 'All' ? 'page' : undefined}>All <b>{allCount}</b></Link>
            {list.statusCounts.sort((a, b) => STUDENT_STATUSES.indexOf(a.status) - STUDENT_STATUSES.indexOf(b.status)).map((s) => (
              <Link key={s.status} className="ra-filter" href={qs({ status: s.status, page: undefined })} aria-current={f.status === s.status ? 'page' : undefined}>{s.status} <b>{s.n}</b></Link>
            ))}
          </nav>
          <details open={!!(f.classId || f.leftFrom || f.leftTo || f.startFrom || f.startTo || f.medical)}>
            <summary className="ra-link" style={{ display: 'inline-grid' }}>More filters</summary>
            <form action="/admin/students" className="ra-fields" style={{ marginTop: 10, alignItems: 'end' }}>
              <input type="hidden" name="q" value={f.q} />{f.status !== 'All' && <input type="hidden" name="status" value={f.status} />}
              <div className="ra-field"><label htmlFor="fc">Class</label><select className="ra-select" id="fc" name="classId" defaultValue={f.classId}><option value="">Any class</option><option value="none">No class designated</option>{classes.map((c) => <option key={c.c.id} value={c.c.id}>{c.c.name}</option>)}</select></div>
              <div className="ra-field"><label htmlFor="sf">Started from</label><input className="ra-input" id="sf" type="date" name="startFrom" defaultValue={f.startFrom} /></div>
              <div className="ra-field"><label htmlFor="st">Started to</label><input className="ra-input" id="st" type="date" name="startTo" defaultValue={f.startTo} /></div>
              <div className="ra-field"><label htmlFor="lf">Left from</label><input className="ra-input" id="lf" type="date" name="leftFrom" defaultValue={f.leftFrom} /></div>
              <div className="ra-field"><label htmlFor="lt">Left to</label><input className="ra-input" id="lt" type="date" name="leftTo" defaultValue={f.leftTo} /></div>
              <label className="ra-check"><input type="checkbox" name="medical" value="1" defaultChecked={!!f.medical} /><span>Medical notes only</span></label>
              <div className="ra-toolbar"><button className="ra-btn">Apply filters</button><Link className="ra-link" href="/admin/students">Clear</Link></div>
            </form>
          </details>
          <StudentsTable
            rows={list.rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.surname}`, gender: r.gender, classes: r.classes, age: r.age, yearGroup: r.yearGroup, status: r.status, hasMedical: r.hasMedical }))}
            classes={classes.map((c) => ({ value: String(c.c.id), label: c.c.name }))} statuses={[...STUDENT_STATUSES]}
            canEdit={canEdit} canDelete={adminCan(admin.staff, 'delete')} filtered={filtered} />
          {pages > 1 && (
            <nav className="ra-pager" aria-label="Pages">
              {f.page > 1 ? <Link className="ra-btn" href={qs({ page: f.page - 1 })}>Previous</Link> : <span />}
              <span>Page {f.page} of {pages}</span>
              {f.page < pages ? <Link className="ra-btn" href={qs({ page: f.page + 1 })}>Next</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
