import Link from 'next/link';
import { db } from '@/db';
import { TEACHER_STATUSES } from '@/db/schema';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listTeachers } from '@/server/people/teachers';
import { TeachersTable } from './TeachersTable';

export const metadata = { title: 'Teachers' };

export default async function Teachers({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  const wanted = (await searchParams).status;
  const status = TEACHER_STATUSES.find((s) => s === wanted);
  const [rows, all] = await Promise.all([listTeachers(db, status), listTeachers(db)]);
  const counts = TEACHER_STATUSES.map((s) => ({ s, n: all.filter((t) => t.status === s).length })).filter((c) => c.n);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Teachers</h1><p>Staff records, working hours and portal access</p></div>
        <div className="ra-toolbar no-print">
          {adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/teachers/new"><Icon name="plus" />Add teacher</Link>}
          <Link className="ra-btn" href="/admin/import/teachers">Import</Link>
          <PrintButton label="PDF" />
          <a className="ra-btn" href={`/admin/teachers/export${status ? `?status=${encodeURIComponent(status)}` : ''}`}>CSV</a>
          <Link className="ra-btn" href="/admin/teachers/hours">Working hours</Link>
        </div></div>
      <section className="ra-card">
        <div className="ra-card-h"><div><h2>Teacher list</h2><div className="ra-note">{plural(rows.length, 'teacher')}</div></div></div>
        <nav className="ra-filters no-print" aria-label="Status">
          <Link className="ra-filter" href="?" aria-current={!status ? 'page' : undefined}>All <b>{all.length}</b></Link>
          {counts.map((c) => <Link key={c.s} className="ra-filter" href={`?status=${encodeURIComponent(c.s)}`} aria-current={status === c.s ? 'page' : undefined}>{c.s} <b>{c.n}</b></Link>)}
        </nav>
        <TeachersTable rows={rows.map((t) => ({ id: t.id, name: t.name, status: t.status, email: t.email }))}
          canEdit={adminCan(admin.staff, 'edit')} canDelete={adminCan(admin.staff, 'delete')} canViewAs={admin.staff.isSuper} />
      </section>
    </div>
  );
}
