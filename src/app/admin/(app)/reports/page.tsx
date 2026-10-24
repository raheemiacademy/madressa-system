import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listReports } from '@/server/learning/eoty';
import { yearAndClasses } from '../students/year-classes';
import { LEARNING_TOOLS } from '../exams/tools';

export const metadata = { title: 'EOTY reports' };

export default async function Reports() {
  const admin = await requireAdmin();
  const { year } = await yearAndClasses();
  const rows = await listReports(db, year?.id);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>End-of-term reports</h1><p>Teachers’ comments, scores, exam results, attendance and homework, generated as a report per student</p></div>
        <div className="ra-toolbar">{adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/reports/new"><Icon name="plus" />New report</Link>}<Link className="ra-btn" href="/admin/reports/paragraphs">Paragraph templates</Link></div></div>
      <div className="ra-more"><span className="ra-more-l">More</span>{LEARNING_TOOLS.filter(([h]) => h !== '/admin/reports').map(([h, l]) => <Link key={h} className="ra-btn" href={h}>{l}</Link>)}</div>
      <section className="ra-card" aria-label="Reports">
        {rows.length === 0 ? <p className="ra-empty">No reports{year ? ` in ${year.title}` : ''} yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>#</th><th>Report</th><th>Term</th><th>Settings</th><th>Status</th><th><span className="sr-only">Pages</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="ra-muted">{r.id}</td><td className="wrap"><Link href={`/admin/reports/${r.id}`}>{r.title}</Link></td>
                <td>{formatCalendarDate(r.termStart)} to {formatCalendarDate(r.termEnd)}</td>
                <td className="wrap">{[r.includeExams && 'exams', r.includePositions && 'positions', r.includeAttendance && 'attendance', r.includeHomework && 'homework', r.scoring && `${r.questions.length} scored questions`].filter(Boolean).join(', ')}</td>
                <td><Chip colour={r.active ? 'var(--color-ok)' : 'var(--color-fg-muted)'}>{r.active ? 'Active' : 'Inactive'}</Chip></td>
                <td><span className="ra-toolbar" style={{ gap: 8 }}><Link className="ra-link" href={`/admin/reports/${r.id}/comments`}>Comments</Link><Link className="ra-link" href={`/admin/reports/${r.id}/overview`}>Overview</Link><Link className="ra-link" href={`/admin/reports/${r.id}/print`}>Generate</Link></span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
