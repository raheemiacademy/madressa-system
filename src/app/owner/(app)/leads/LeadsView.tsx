import Link from 'next/link';
import { db } from '@/db';
import { ago } from '@/lib/owner-format';
import { requireOwner } from '@/server/next/owner';
import { listLeads, setupCommand } from '@/server/owner/leads';
import { NotYet, Page } from '../../_ui/parts';
import { LeadsInbox } from './LeadsInbox';

/** /owner/leads and /owner/leads/<id>: the inbox, with the chosen lead (or, on a laptop, the newest) beside it. */
export async function LeadsView({ id }: { id?: number }) {
  await requireOwner();
  const leads = await listLeads(db), now = new Date();
  const mainHost = (() => { try { return new URL(process.env.APP_URL ?? '').host; } catch { return 'example.org'; } })();
  if (!leads.length) return <Page title="Leads"><NotYet title="No leads yet">Early-access sign-ups and contact messages from the website land here, newest first.</NotYet></Page>;
  const rows = leads.map((l) => ({ ...l, receivedAt: undefined, when: ago(l.receivedAt, now), command: setupCommand(l, mainHost) }));
  const selected = id ? leads.find((l) => l.id === id)?.id ?? null : leads[0]!.id;
  return (
    <Page title="Leads">
      {id && selected === null ? <NotYet title="Not found">That lead may have been removed. <Link href="/owner/leads">Back to leads</Link></NotYet>
        : <LeadsInbox leads={rows} selectedId={selected} picked={!!id} />}
    </Page>
  );
}
