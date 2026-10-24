import Link from 'next/link';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import type { PaymentRow } from '@/server/fees/reports';

/** Payment, Date, Student, Type, Amount, Method, Status, Receipt — shared by the fees payment lists. */
export function PaymentsTable({ rows, empty }: { rows: PaymentRow[]; empty: string }) {
  if (!rows.length) return <p className="ra-empty">{empty}</p>;
  const total = rows.reduce((s, r) => s + r.amountPence, 0);
  return (
    <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
      <thead><tr><th>Payment</th><th>Date</th><th>Student</th><th>Type</th><th className="num">Amount</th><th>Method</th><th>Status</th><th>Reference</th><th><span className="sr-only">Receipt</span></th></tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p.id}>
          <td className="ra-muted">#{p.id}</td><td>{formatCalendarDate(p.receivedOn)}</td>
          <td className="wrap"><Link href={`/admin/fees/student/${p.studentId}`}>{p.studentName}</Link></td><td>{p.type}</td>
          <td className="num">{formatPence(p.amountPence)}</td><td>{p.method}</td><td><Chip>{p.status}</Chip></td><td className="wrap">{p.reference ?? ''}</td>
          <td><span className="ra-acts"><Link href={`/admin/fees/receipt/${p.id}`} aria-label={`Receipt for payment #${p.id}`} title="Receipt"><Icon name="receipt" /></Link></span></td>
        </tr>
      ))}</tbody>
      <tfoot><tr><th colSpan={4}>{rows.length === 1 ? '1 payment' : `${rows.length} payments`}</th><th className="num">{formatPence(total)}</th><th colSpan={4} /></tr></tfoot>
    </table></div>
  );
}
