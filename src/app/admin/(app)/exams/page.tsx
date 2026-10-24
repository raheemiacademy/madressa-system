import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listExams } from '@/server/learning/exams';
import { yearAndClasses } from '../students/year-classes';
import { LEARNING_TOOLS } from './tools';

export const metadata = { title: 'Exams' };
const KIND = { official: 'Official exams', progressive: 'Progressive tests', all: 'All' } as const;
const STATUS = { open: 'Open', closed: 'Closed', locked: 'Locked', all: 'Any status' } as const;
const STATUS_C: Record<string, string> = { open: 'var(--color-ok)', closed: 'var(--ra-blue)', locked: 'var(--color-fg-muted)' };

export default async function Exams({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const kind = (sp.kind && sp.kind in KIND ? sp.kind : 'official') as keyof typeof KIND;
  const status = (sp.status && sp.status in STATUS ? sp.status : 'all') as keyof typeof STATUS;
  const { year, options } = await yearAndClasses();
  const allYears = sp.years === 'all';
  const rows = await listExams(db, { official: kind === 'all' ? undefined : kind === 'official', status: status === 'all' ? undefined : status, classId: Number(sp.class) || undefined,
    byTeacher: sp.by === 'teacher' ? true : sp.by === 'admin' ? false : undefined, yearId: allYears ? undefined : year?.id });
  const q = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ kind, status, class: sp.class, by: sp.by, years: sp.years, ...v }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Exams &amp; tests</h1><p>Official exams feed end-of-term reports; progressive tests track progress during the year</p></div>
        <div className="ra-toolbar">{adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/exams/new"><Icon name="plus" />Add exam</Link>}</div></div>
      <div className="ra-more"><span className="ra-more-l">More</span>{LEARNING_TOOLS.slice(1).map(([h, l]) => <Link key={h} className="ra-btn" href={h}>{l}</Link>)}</div>
      <nav className="ra-filters" aria-label="Type">{Object.entries(KIND).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={kind === k ? 'page' : undefined} href={q({ kind: k })}>{l}</Link>)}</nav>
      <nav className="ra-filters" aria-label="Status">{Object.entries(STATUS).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={status === k ? 'page' : undefined} href={q({ status: k })}>{l}</Link>)}</nav>
      <form className="ra-card ra-toolbar" role="search">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="status" value={status} />
        <div className="ra-field"><label htmlFor="ex-class">Class</label><select className="ra-select" id="ex-class" name="class" defaultValue={sp.class ?? ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="ex-by">Added by</label><select className="ra-select" id="ex-by" name="by" defaultValue={sp.by ?? ''}><option value="">Anyone</option><option value="admin">Admins</option><option value="teacher">Teachers</option></select></div>
        <label className="ra-check"><input type="checkbox" name="years" value="all" defaultChecked={allYears} /><span>All years</span></label>
        <button className="ra-btn">Filter</button>
      </form>
      <section className="ra-card" aria-label="Exams">
        {rows.length === 0 ? <p className="ra-empty">No exams match.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Exam</th><th>Class</th><th>Date</th><th>Type</th><th className="num">Papers</th><th>Status</th><th><span className="sr-only">Results</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.e.id}><td className="wrap"><Link href={`/admin/exams/${r.e.id}`}>{r.e.title}</Link></td><td>{r.className}</td><td>{formatCalendarDate(r.e.date)}</td>
                <td>{r.e.official ? 'Official' : 'Progressive'}{r.e.addedByTeacher ? <span className="ra-muted"> · teacher</span> : null}</td><td className="num">{r.tests}</td>
                <td><Chip colour={STATUS_C[r.e.status]}>{STATUS[r.e.status as keyof typeof STATUS]}</Chip></td><td><Link className="ra-link" href={`/admin/exams/${r.e.id}/results`}>Results</Link></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
