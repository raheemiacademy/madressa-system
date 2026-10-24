import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Conversation } from '@/app/_portal/Messages';
import { requireParent } from '@/server/next/portal';
import { partyThread } from '@/server/portal/messages';
import { replyAction } from '../../actions';

export const metadata = { title: 'Conversation' };

/** One conversation. Only conversations this parent is on can be opened. */
export default async function ParentThread({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireParent();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await partyThread(db, p.party, id) : null;
  if (!data) notFound();
  return (
    <>
      <PortalHead title={data.thread.subject} back="/parent/messages" />
      <main className="rp-main"><Conversation data={data} fileBase="/parent/file" reply={replyAction.bind(null, id)} /></main>
    </>
  );
}
