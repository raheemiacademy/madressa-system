import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { overview } from '@/server/learning/eoty';

export const metadata = { title: 'Report overview' };

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const o = Number.isInteger(id) ? await overview(db, id) : null;
  if (!o) notFound();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{o.report.title}: overview</h1><p>How many students in each class have comments or scores written</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/reports/${id}`}>Report settings</Link></div></div>
      <section className="ra-card" aria-label="Overview">
        {o.classes.length === 0 ? <p className="ra-empty">No classes had students during this term.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Class</th><th className="num">Students</th><th className="num">Written</th><th className="num">Still to do</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{o.classes.map((c) => (
              <tr key={c.classId}><td>{c.name}</td><td className="num">{c.students}</td><td className="num">{c.written}</td><td className={`num${c.students - c.written ? ' ra-warn' : ''}`}>{c.students - c.written}</td>
                <td><span className="ra-toolbar" style={{ gap: 8 }}><Link className="ra-link" href={`/admin/reports/${id}/comments?class=${c.classId}`}>Comments</Link><Link className="ra-link" href={`/admin/reports/${id}/print?class=${c.classId}`}>Reports</Link></span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
