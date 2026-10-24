import Link from 'next/link';
import { db } from '@/db';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { overview } from '@/server/fees/reports';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Full overview' };

export default async function Overview() {
  await requireAdmin('fees');
  const { year } = await yearAndClasses();
  const rows = year ? await overview(db, year.id) : [];
  const sum = (k: 'total' | 'received' | 'balance') => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="ra-page">
      <FeesHead title="Full overview" desc={`Every student’s total, paid and balance${year ? ` for ${year.title}` : ''}`} />
      <section className="ra-card" aria-label="Overview">
        {rows.length === 0 ? <p className="ra-empty">No invoices this year yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 700 }}><table className="ra-table">
            <thead><tr><th>St. ID</th><th>Student</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td className="ra-muted">{r.id}</td><td className="wrap"><Link href={`/admin/fees/student/${r.id}`}>{r.name}</Link></td>
              <td className="num">{formatPence(r.total)}</td><td className="num">{formatPence(r.received)}</td><td className={`num${r.balance > 0 ? ' ra-warn' : ''}`}>{formatPence(r.balance)}</td></tr>)}</tbody>
            <tfoot><tr><th colSpan={2}>{rows.length === 1 ? '1 student' : `${rows.length} students`}</th><th className="num">{formatPence(sum('total'))}</th><th className="num">{formatPence(sum('received'))}</th><th className="num">{formatPence(sum('balance'))}</th></tr></tfoot>
          </table></div>
        )}
      </section>
    </div>
  );
}
