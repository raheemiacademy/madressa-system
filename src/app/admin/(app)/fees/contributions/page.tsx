import Link from 'next/link';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { contribution, invoice, payment } from '@/db/schema';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Contributions' };

export default async function Contributions() {
  await requireAdmin('fees');
  const { year } = await yearAndClasses();
  const rows = year ? await db.select({
    c: contribution,
    invoices: sql<number>`count(distinct ${invoice.id})`.mapWith(Number),
    total: sql<number>`coalesce((select sum(i.amount_pence) from invoice i where i.contribution_id = ${contribution.id} and i.deleted_at is null), 0)`.mapWith(Number),
    collected: sql<number>`coalesce(sum(${payment.amountPence}) filter (where ${payment.status} = 'Cleared'), 0)`.mapWith(Number)
  }).from(contribution).leftJoin(invoice, sql`${invoice.contributionId} = ${contribution.id} and ${isNull(invoice.deletedAt)}`).leftJoin(payment, eq(payment.invoiceId, invoice.id))
    .where(eq(contribution.academicYearId, year.id)).groupBy(contribution.id).orderBy(desc(contribution.invoiceDate)) : [];
  return (
    <div className="ra-page">
      <FeesHead title="Contributions" desc="One-off charges, such as a trip or materials, invoiced to the students you choose">
        <Link className="ra-btn" href="/admin/fees/contributions/new"><Icon name="plus" />Create contribution</Link>
      </FeesHead>
      <section className="ra-card" aria-label="Contributions">
        {rows.length === 0 ? <p className="ra-empty">No contributions this year yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Contribution</th><th className="num">Amount</th><th className="num">Total invoices</th><th className="num">Total</th><th className="num">Collected</th><th>Due date</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.c.id}><td className="wrap">{r.c.description}<div className="ra-note">{r.c.audience}</div></td><td className="num">{formatPence(r.c.amountPence)}</td>
                <td className="num">{r.invoices}</td><td className="num">{formatPence(r.total)}</td><td className="num">{formatPence(r.collected)}</td><td>{formatCalendarDate(r.c.dueDate)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
