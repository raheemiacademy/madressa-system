import { requireOwner } from '@/server/next/owner';
import { NotYet, Page } from '../../_ui/parts';

export const metadata = { title: 'Alerts' };

export default async function AlertsPage() {
  await requireOwner();
  return (
    <Page title="Alerts">
      <NotYet title="Alerts aren’t switched on yet">The history of every alert, and the settings for push and email, appear here.</NotYet>
    </Page>
  );
}
