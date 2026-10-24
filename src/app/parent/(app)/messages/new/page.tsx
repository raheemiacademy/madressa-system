import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { NewMessage } from '@/app/_portal/Messages';
import { requireParent } from '@/server/next/portal';
import { recipientsFor } from '@/server/portal/messages';
import { newMessageAction } from '../../actions';

export const metadata = { title: 'New message' };

/** Write to the office, or to your children's teachers when the school allows it (§4 routes). */
export default async function NewParentMessage() {
  const p = await requireParent();
  const recipients = await recipientsFor(db, p.party, p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c));
  return (
    <>
      <PortalHead title="New message" back="/parent/messages" />
      <main className="rp-main"><NewMessage recipients={recipients} action={newMessageAction} /></main>
    </>
  );
}
