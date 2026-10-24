import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { NewMessage } from '@/app/_portal/Messages';
import { requireTeacher } from '@/server/next/portal';
import { recipientsFor } from '@/server/portal/messages';
import { newMessageAction } from '../../actions';

export const metadata = { title: 'New message' };

/** Write to the office, colleagues, or parents of classes where you have the Messaging privilege (§4 routes). */
export default async function NewTeacherMessage() {
  const t = await requireTeacher();
  const recipients = await recipientsFor(db, t.party, t.ctx.classes.filter((c) => c.canMessage).map((c) => c.id));
  return (
    <>
      <PortalHead title="New message" back="/teacher/messages" />
      <main className="rp-main"><NewMessage recipients={recipients} action={newMessageAction} /></main>
    </>
  );
}
