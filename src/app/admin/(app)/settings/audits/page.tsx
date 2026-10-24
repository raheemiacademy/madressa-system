import { desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';

export const metadata = { title: 'Audits' };
const PER_PAGE = 50;

export default async function AuditsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin('super');
  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const [[count], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog),
    db.select().from(auditLog).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(PER_PAGE).offset((page - 1) * PER_PAGE)
  ]);
  const total = count?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  return (
    <section className="ra-card" aria-labelledby="aud-h">
      <div className="ra-card-h"><div><h2 id="aud-h">Audits</h2><div className="ra-note">{total ? `${plural(total, 'key action')} logged, newest first` : 'Key actions by admin staff are logged here'}</div></div></div>
      {rows.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
        <div className="ra-table-wrap" tabIndex={0}>
          <table className="ra-table">
            <thead><tr><th>Date</th><th>Admin</th><th>Audit</th><th className="opt">Page</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatInstant(r.at, 'dd/MM/yyyy HH:mm')}</td>
                  <td className="wrap">{r.actorName}</td>
                  <td className="wrap" style={{ maxWidth: '44ch' }}>{r.action}</td>
                  <td className="opt ra-muted">{r.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="ra-pager" aria-label="Pages">
          {page > 1 ? <Link className="ra-btn" href={`?page=${page - 1}`}>Newer</Link> : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? <Link className="ra-btn" href={`?page=${page + 1}`}>Older</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
