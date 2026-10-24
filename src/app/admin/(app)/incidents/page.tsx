import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { incidentCounts, listIncidents } from '@/server/learning/incidents';
import { yearAndClasses } from '../students/year-classes';

export const metadata = { title: 'Incidents' };
const KINDS = { all: 'All', student: 'Students', teacher: 'Teachers', staff: 'Staff' } as const;
const SEV_C: Record<string, string> = { Low: 'var(--ra-sky)', Medium: 'var(--ra-blue)', High: 'var(--ra-violet)', Serious: 'var(--color-bad)' };
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

export default async function Incidents({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const kind = (sp.kind && sp.kind in KINDS ? sp.kind : 'all') as keyof typeof KINDS;
  const { options } = await yearAndClasses();
  const [rows, counts] = await Promise.all([listIncidents(db, { kind: kind === 'all' ? undefined : kind, classId: Number(sp.class) || undefined, studentId: Number(sp.student) || undefined, from: date(sp.from), to: date(sp.to) }), incidentCounts(db)]);
  const q = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ kind, class: sp.class, from: sp.from, to: sp.to, ...v }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Incidents</h1><p>Recent incidents for students, teachers and staff</p></div>
        <div className="ra-toolbar">{adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/incidents/new"><Icon name="plus" />Record incident</Link>}
          <Link className="ra-btn" href="/admin/incidents/reports">Health &amp; safety reports</Link><Link className="ra-btn" href="/admin/incidents/templates">Templates</Link></div></div>
      {sp.saved && <p className="ra-banner ra-success" role="status" style={{ margin: 0 }}>Incident saved{Number(sp.emailed) ? `; ${sp.emailed} emails queued` : ''}{Number(sp.texted) ? `; ${sp.texted} texts queued` : ''}.</p>}
      <div className="ra-kpis">
        {(['student', 'teacher', 'staff'] as const).map((k) => <div key={k} className="ra-kpi"><div className="ra-kpi-top">{KINDS[k]}</div><div className="ra-kpi-val">{counts[k]}</div><div className="ra-kpi-sub">{counts[k] === 1 ? 'incident' : 'incidents'} recorded</div></div>)}
      </div>
      <nav className="ra-filters" aria-label="Who">{Object.entries(KINDS).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={kind === k ? 'page' : undefined} href={q({ kind: k })}>{l}</Link>)}</nav>
      <form className="ra-card ra-toolbar" role="search">
        <input type="hidden" name="kind" value={kind} />
        <div className="ra-field"><label htmlFor="in-class">Class</label><select className="ra-select" id="in-class" name="class" defaultValue={sp.class ?? ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="in-from">From</label><input className="ra-input" id="in-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="in-to">To</label><input className="ra-input" id="in-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
        <button className="ra-btn">Filter</button>
      </form>
      <section className="ra-card" aria-label="Incidents">
        {rows.length === 0 ? <p className="ra-empty">No incidents match.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
            <thead><tr><th>When</th><th>Who</th><th>Title</th><th>Severity</th><th>Shared</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.i.id}><td>{formatInstant(r.i.occurredAt, 'dd/MM/yyyy HH:mm')}</td><td className="wrap">{r.who}<div className="ra-note">{r.i.kind === 'student' ? r.className ?? 'Student' : r.i.kind === 'teacher' ? 'Teacher' : 'Staff'}</div></td>
                <td className="wrap"><Link href={`/admin/incidents/${r.i.id}`}>{r.i.title}</Link></td><td><Chip colour={SEV_C[r.i.severity]}>{r.i.severity}</Chip></td>
                <td className="wrap">{[r.i.inEoty && 'report', r.i.onPortal && 'portal', r.i.emailed && 'emailed', r.i.texted && 'texted'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) || <span className="ra-muted">No</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
