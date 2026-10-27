import { requireOwner } from '@/server/next/owner';
import { NotYet, Page } from '../../_ui/parts';

export const metadata = { title: 'Leads' };

export default async function LeadsPage() {
  await requireOwner();
  return (
    <Page title="Leads">
      <NotYet title="The leads inbox isn’t built yet">Early-access sign-ups and contact messages from the website will land here, newest first. Until then, <code>./madrasah signups</code> and <code>./madrasah messages</code> on the server list them.</NotYet>
    </Page>
  );
}
