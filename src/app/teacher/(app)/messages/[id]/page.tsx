import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Conversation } from '@/app/_portal/Messages';
import { requireTeacher } from '@/server/next/portal';
import { partyThread } from '@/server/portal/messages';
import { replyAction } from '../../actions';

export const metadata = { title: 'Conversation' };

/** One conversation. Only conversations this teacher is on can be opened. */
export default async function TeacherThread({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await partyThread(db, t.party, id) : null;
  if (!data) notFound();
  return (
    <>
      <PortalHead title={data.thread.subject} back="/teacher/messages" />
      <main className="rp-main"><Conversation data={data} fileBase="/teacher/file" reply={replyAction.bind(null, id)} /></main>
    </>
  );
}
