import Link from 'next/link';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import type { InvoiceRow } from '@/server/fees/invoices';

/** Invoice list used by Monthly Fees and Reminders. Optional leading checkbox column. */
export function InvoiceTable({ rows, empty, select }: { rows: InvoiceRow[]; empty: string; select?: string }) {
  if (!rows.length) return <p className="ra-empty">{empty}</p>;
  return (
    <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
      <thead><tr>{select && <th><span className="sr-only">Select</span></th>}<th>Inv.</th><th>Student</th><th>Type</th><th>Description</th><th>Due</th><th className="num">Amount</th><th className="num">Received</th><th className="num">Pending</th><th className="num">Balance</th><th>Status</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}>
          {select && <td><input type="checkbox" name={select} value={r.id} defaultChecked aria-label={`Include invoice #${r.id}`} /></td>}
          <td className="ra-muted">#{r.id}</td><td className="wrap"><Link href={`/admin/fees/student/${r.studentId}`}>{r.studentName}</Link></td><td>{r.type}</td>
          <td className="wrap">{r.description ?? ''}</td><td>{formatCalendarDate(r.dueDate)}</td><td className="num">{formatPence(r.amountPence)}</td>
          <td className="num">{formatPence(r.received)}</td><td className="num">{r.pending ? formatPence(r.pending) : ''}</td><td className="num">{formatPence(Math.max(0, r.balance))}</td><td><Chip>{r.status}</Chip></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
