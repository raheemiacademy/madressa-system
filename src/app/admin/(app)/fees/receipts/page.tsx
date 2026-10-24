import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { SelectField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { paymentList } from '@/server/fees/reports';
import { receiptsAction } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Send receipts' };
const TABS = { unsent: 'Unsent', sent: 'Sent', manual: 'Manually sent', no_email: 'No email' } as const;

export default async function Receipts({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const tab = (sp.tab && sp.tab in TABS ? sp.tab : 'unsent') as keyof typeof TABS;
  const rows = await paymentList(db, { receipt: tab, status: 'Cleared', limit: 1000 });
  const ops = tab === 'unsent' ? [{ value: 'manual', label: 'Send manually (mark as sent)' }, { value: 'no_email', label: 'No email for these' }] : [{ value: 'unsent', label: 'Move back to unsent' }];
  return (
    <div className="ra-page">
      <FeesHead title="Send receipts" desc="Receipts for cleared payments" />
      <nav className="ra-filters" aria-label="Receipts">{Object.entries(TABS).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={tab === k ? 'page' : undefined} href={`?tab=${k}`}>{l}</Link>)}</nav>
      <div className="ra-banners"><div className="ra-banner"><div>Emailing receipts arrives with the mail queue in Phase 5. Until then, print a receipt or mark payments as sent manually.</div></div></div>
      {rows.length === 0 ? <p className="ra-empty">No {TABS[tab].toLowerCase()} receipts.</p> : (
        <Form action={receiptsAction} submit="Apply to selected" savebar={false}>
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
            <thead><tr><th><span className="sr-only">Select</span></th><th>ID</th><th>Student</th><th>Class</th><th className="num">Fees in</th><th>Inv.</th><th>Date</th><th>Status</th><th>Quick send</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td><input type="checkbox" name="ids" value={p.id} aria-label={`Select payment #${p.id}`} /></td>
                <td className="ra-muted">#{p.id}</td><td className="wrap"><Link href={`/admin/fees/student/${p.studentId}`}>{p.studentName}</Link></td><td className="wrap">{p.classes ?? ''}</td>
                <td className="num">{formatPence(p.amountPence)}</td><td className="ra-muted">#{p.invoiceId}</td><td>{formatCalendarDate(p.receivedOn)}</td><td><Chip>{p.status}</Chip></td>
                <td><span className="ra-acts"><Link href={`/admin/fees/receipt/${p.id}`} aria-label={`Open receipt for payment #${p.id}`} title="Open receipt"><Icon name="receipt" /></Link></span></td></tr>
            ))}</tbody>
          </table></div>
          <div className="ra-fields">
            <SelectField name="op" label="With the selected receipts" options={ops} />
          </div>
        </Form>
      )}
    </div>
  );
}
