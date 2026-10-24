import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Inbox } from '@/app/_portal/Messages';
import { Icon } from '@/components/Icon';
import { requireParent } from '@/server/next/portal';
import { partyInbox } from '@/server/portal/messages';

export const metadata = { title: 'Messages' };

/** §10/§20 A parent's conversations with the office and teachers. */
export default async function Messages() {
  const p = await requireParent();
  const threads = await partyInbox(db, p.party);
  return (
    <>
      <PortalHead title="Messages" back="/parent/more"><Link className="rp-icon-btn tap" href="/parent/messages/new" aria-label="New message"><Icon name="plus" /></Link></PortalHead>
      <main className="rp-main"><Inbox threads={threads} base="/parent/messages" /></main>
    </>
  );
}
