import { db } from '@/db';
import { TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { sentMail } from '@/server/ops/system';
import { deleteMailAction } from '../actions';
import { OpsNav } from '../OpsNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email delivery' };
const preview = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 400);

/** §3 Email delivery tracking: every email the system has sent, with a preview; delete the record before a date. */
export default async function EmailLog({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin('super');
  const q = (await searchParams).q?.trim().slice(0, 80);
  const rows = await sentMail(db, { q });
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Email delivery</h1><p>Emails the system has sent (the latest 200). Waiting and failed ones are in the mail queue.</p></div></div>
      <OpsNav current="/admin/tools/email" />
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field grow"><label htmlFor="em-q">To or subject</label><input id="em-q" className="ra-input" type="search" name="q" defaultValue={q ?? ''} /></div>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Search</button>
      </form>
      <section className="ra-card" aria-label="Sent emails">
        {!rows.length ? <p className="ra-empty">No emails sent{q ? ' matching that search' : ' yet'}.</p> : (
          <div className="ra-table-wrap">
            <table className="ra-table">
              <thead><tr><th>Date</th><th>Subject</th><th>To</th><th className="opt">Sent by</th><th className="opt">CC / BCC</th></tr></thead>
              <tbody>
                {rows.map(({ m, sentBy }) => (
                  <tr key={m.id}>
                    <td>{m.sentAt ? formatInstant(m.sentAt, 'dd/MM/yyyy HH:mm') : '—'}</td>
                    <td className="wrap"><details><summary>{m.subject}</summary><p className="ra-note" style={{ margin: '6px 0 0', maxWidth: '60ch' }}>{preview(m.html)}</p></details></td>
                    <td className="wrap">{m.toName ? `${m.toName} <${m.toEmail}>` : m.toEmail}</td>
                    <td className="opt wrap">{sentBy ?? 'System'}</td>
                    <td className="opt wrap">{[m.cc, m.bcc].filter(Boolean).join(' / ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Form action={deleteMailAction} submit="Delete sent emails before this date" savebar={false}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-heading)' }}>Delete old email records</h2>
        <div className="ra-fields"><TextField name="before" label="Sent before" type="date" /><TextField name="confirmName" label="Type the school name to confirm" autoComplete="off" /></div>
      </Form>
    </div>
  );
}
