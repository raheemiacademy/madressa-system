import Link from 'next/link';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { SelectField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { queueList } from '@/server/comm/mail';
import { queueAction } from '../comm-actions';

export const metadata = { title: 'Mail queue' };
const TABS = { queued: 'Queued', failed: 'Failed', sent: 'Sent' } as const;

export default async function MailQueue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin('super');
  const sp = await searchParams;
  const tab = (sp.tab && sp.tab in TABS ? sp.tab : 'queued') as keyof typeof TABS;
  const rows = await queueList(db, tab === 'sent' ? 'sent' : tab === 'failed' ? 'failed' : 'queued');
  const driver = process.env.EMAIL_DRIVER === 'smtp' ? 'SMTP' : 'test mode (emails are logged, not sent)';
  return (
    <section className="ra-card" aria-labelledby="mq-h">
      <div className="ra-card-h"><div><h2 id="mq-h">Mail queue</h2><div className="ra-note">Emails waiting to go, sent by the background worker within the per-minute limit. Sending: {driver}.</div></div></div>
      <nav className="ra-filters" aria-label="Queue">{Object.entries(TABS).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={tab === k ? 'page' : undefined} href={`?tab=${k}`}>{l}</Link>)}</nav>
      {rows.length === 0 ? <p className="ra-empty">No {TABS[tab].toLowerCase()} emails.</p> : (
        <Form action={queueAction} card={false} savebar={false} submit="Apply to selected">
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 600 }}><table className="ra-table">
            <thead><tr>{tab !== 'sent' && <th><span className="sr-only">Select</span></th>}<th>Date/time</th><th>To</th><th>From</th><th>Subject</th><th>CC</th><th>BCC</th><th className="num">Attachments</th>{tab === 'failed' && <th>Error</th>}</tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id}>
                {tab !== 'sent' && <td><input type="checkbox" name="ids" value={m.id} aria-label={`Select email to ${m.toEmail}`} /></td>}
                <td>{formatInstant(m.sentAt ?? m.createdAt, 'dd/MM/yyyy HH:mm')}</td><td className="wrap">{m.toName ? `${m.toName} · ` : ''}{m.toEmail}</td><td className="wrap">{m.fromEmail ?? ''}</td>
                <td className="wrap">{m.subject}</td><td className="wrap">{m.cc ?? ''}</td><td className="wrap">{m.bcc ?? ''}</td><td className="num">{m.attachments || ''}</td>
                {tab === 'failed' && <td className="wrap">{m.lastError ?? ''}</td>}
              </tr>
            ))}</tbody>
          </table></div>
          {tab !== 'sent' && <SelectField name="op" label="Selected emails" options={[{ value: 'send', label: 'Send now' }, { value: 'delete', label: 'Delete' }]} />}
        </Form>
      )}
    </section>
  );
}
