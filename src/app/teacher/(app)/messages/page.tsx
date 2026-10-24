import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Inbox } from '@/app/_portal/Messages';
import { Icon } from '@/components/Icon';
import { requireTeacher } from '@/server/next/portal';
import { partyInbox } from '@/server/portal/messages';

export const metadata = { title: 'Messages' };

/** §10/§20 A teacher's conversations with the office, colleagues and parents. */
export default async function Messages() {
  const t = await requireTeacher();
  const threads = await partyInbox(db, t.party);
  return (
    <>
      <PortalHead title="Messages"><Link className="rp-icon-btn tap" href="/teacher/messages/new" aria-label="New message"><Icon name="plus" /></Link></PortalHead>
      <main className="rp-main"><Inbox threads={threads} base="/teacher/messages" /></main>
    </>
  );
}
