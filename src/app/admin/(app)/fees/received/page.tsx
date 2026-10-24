import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { paymentList } from '@/server/fees/reports';
import { FeesHead } from '../FeesHead';
import { PaymentsTable } from '../PaymentsTable';

export const metadata = { title: 'All fees received' };

export default async function Received() {
  await requireAdmin('fees');
  const rows = await paymentList(db, { limit: 1000 });
  return (
    <div className="ra-page">
      <FeesHead title="All fees received" desc="Every payment, most recent first (latest 1,000). Use Query fees to filter." />
      <section className="ra-card" aria-label="Payments"><PaymentsTable rows={rows} empty="No payments recorded yet." /></section>
    </div>
  );
}
