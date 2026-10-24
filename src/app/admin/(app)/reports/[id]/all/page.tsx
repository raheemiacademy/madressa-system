import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { eotyEntry, eotyReport, student } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';

export const metadata = { title: 'All report comments' };

export default async function AllComments({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const [r] = Number.isInteger(id) ? await db.select().from(eotyReport).where(eq(eotyReport.id, id)) : [];
  if (!r) notFound();
  const rows = await db.select({ e: eotyEntry, firstName: student.firstName, surname: student.surname }).from(eotyEntry).innerJoin(student, eq(student.id, eotyEntry.studentId))
    .where(and(eq(eotyEntry.reportId, id), isNotNull(eotyEntry.comment))).orderBy(asc(student.surname), asc(student.firstName));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{r.title}: all comments</h1><p>{rows.length === 1 ? '1 comment' : `${rows.length} comments`} written</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/reports/${id}`}>Report settings</Link></div></div>
      <section className="ra-card" aria-label="Comments">
        {rows.length === 0 ? <p className="ra-empty">No comments written yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Student</th><th>Comment</th><th>Written by</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.e.studentId}><td className="wrap">{x.firstName} {x.surname}</td><td className="wrap" style={{ maxWidth: '60ch', whiteSpace: 'pre-wrap' }}>{x.e.comment}</td>
              <td className="wrap">{x.e.writtenBy ?? ''}<div className="ra-note">{formatInstant(x.e.updatedAt, 'dd/MM/yyyy')}</div></td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
