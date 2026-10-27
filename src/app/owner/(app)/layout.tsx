import { getOwnerState, requireOwner } from '@/server/next/owner';
import { Shell } from '../_ui/Shell';

export default async function OwnerAppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <Shell attention={(await getOwnerState()).attentionCount}>{children}</Shell>;
}
