import Link from 'next/link';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { studentTotals } from '@/server/learning/merits';
import { MeritTabs } from '../MeritTabs';

export const metadata = { title: 'Merit totals' };

/** Totals per student: points earned, merits spent in the shop, and what's left. */
export default async function Totals() {
  await requireAdmin();
  const rows = await studentTotals(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Merit totals</h1><p>Points earned by each student, and what they have left to spend in the shop</p></div></div>
      <MeritTabs current="/admin/merits/totals" />
      <section className="ra-card" aria-label="Totals">
        {rows.length === 0 ? <p className="ra-empty">No merits awarded yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 700 }}><table className="ra-table">
            <thead><tr><th>Student</th><th className="num">Awards</th><th className="num">Points</th><th className="num">Spent</th><th className="num">To spend</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td className="wrap"><Link href={`/admin/students/${r.id}`}>{r.name}</Link></td><td className="num">{r.awards}</td><td className="num">{r.points}</td><td className="num">{r.spent || ''}</td><td className="num">{r.balance}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
