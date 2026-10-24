import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/db/schema';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { AddFeesDialog } from './AddFees';

/** Every fees page needs Access Fees Area (each page and action checks again) and gets the Add Fees dialog. */
export default async function FeesLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('fees');
  return <>{children}<AddFeesDialog today={todayIso()} methods={PAYMENT_METHODS} statuses={PAYMENT_STATUSES} /></>;
}
