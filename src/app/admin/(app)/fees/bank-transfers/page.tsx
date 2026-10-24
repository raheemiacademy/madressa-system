import Link from 'next/link';
import { db } from '@/db';
import { PAYMENT_STATUSES } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { SelectField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { paymentList } from '@/server/fees/reports';
import { processPaymentsAction } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Bank transfers' };
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

export default async function BankTransfers({ searchParams }: { searchParams: Promise<{ ref?: string; from?: string; to?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const ref = (sp.ref ?? '').trim().slice(0, 80);
  const rows = await paymentList(db, { method: 'Bank Transfer', reference: ref || undefined, from: date(sp.from), to: date(sp.to), limit: 1000 });
  return (
    <div className="ra-page">
      <FeesHead title="Bank transfers" desc="Payments made by bank transfer. Mark them cleared once the money reaches the account." />
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field grow"><label htmlFor="bt-ref">Reference</label><input className="ra-input" id="bt-ref" name="ref" defaultValue={ref} /></div>
        <div className="ra-field"><label htmlFor="bt-from">From</label><input className="ra-input" id="bt-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="bt-to">To</label><input className="ra-input" id="bt-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
        <button className="ra-btn">Filter</button>
      </form>
      {rows.length === 0 ? <p className="ra-empty">{ref || sp.from || sp.to ? 'No bank transfers match.' : 'No bank transfers recorded yet.'}</p> : (
        <Form action={processPaymentsAction.bind(null, 'Bank transfers')} submit="Apply to selected" savebar={false}>
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
            <thead><tr><th><span className="sr-only">Select</span></th><th>Student</th><th>Invoice</th><th className="num">Inv. amount</th><th className="num">Received</th><th>Date</th><th>Reference</th><th>Status</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td><input type="checkbox" name="ids" value={p.id} aria-label={`Select payment #${p.id}`} /></td>
                <td className="wrap"><Link href={`/admin/fees/student/${p.studentId}`}>{p.studentName}</Link></td><td className="ra-muted">#{p.invoiceId}</td>
                <td className="num">{formatPence(p.invoiceAmount)}</td><td className="num">{formatPence(p.amountPence)}</td><td>{formatCalendarDate(p.receivedOn)}</td>
                <td className="wrap">{p.reference ?? ''}</td><td><Chip>{p.status}</Chip></td></tr>
            ))}</tbody>
          </table></div>
          <div className="ra-fields"><SelectField name="op" label="Set selected to" options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))} /></div>
        </Form>
      )}
    </div>
  );
}
