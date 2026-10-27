import Link from 'next/link';
import { formatDistanceStrict } from 'date-fns';
import { db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { describeDevice } from '@/lib/device';
import { requireOwner } from '@/server/next/owner';
import { ownerSessions } from '@/server/owner/auth';
import { Page } from '../../_ui/parts';
import { Account } from './Account';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const o = await requireOwner();
  const now = new Date();
  const sessions = (await ownerSessions(db, o.identityId, o.token)).map((s) => ({
    device: describeDevice(s.userAgent),
    detail: `${s.current ? 'This device · ' : ''}signed in ${formatInstant(s.createdAt, 'dd/MM/yyyy')}`.replace(/^s/, 'S'),
    when: s.current || now.getTime() - s.lastSeenAt.getTime() < 10 * 60_000 ? 'Active now' : formatDistanceStrict(s.lastSeenAt, now, { addSuffix: true })
  }));
  return (
    <Page title="Account">
      <Account sessions={sessions} />
      <section className="card" aria-labelledby="h-more">
        <div className="card-h"><h2 id="h-more">Server</h2><Link href="/owner/server">Open server page</Link></div>
        <p className="note">Server and Account are in this menu on a phone.</p>
      </section>
    </Page>
  );
}
