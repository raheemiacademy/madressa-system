import { getOwnerState, requireOwner } from '@/server/next/owner';
import { PwaRegister } from '@/app/_portal/TabBar';
import { Shell } from '../_ui/Shell';

export default async function OwnerAppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const s = await getOwnerState();
  // The service worker makes /owner installable on a phone and shows its push alerts.
  return <Shell attention={s.attentionCount} leads={s.newLeads}><PwaRegister scope="/owner" />{children}</Shell>;
}
