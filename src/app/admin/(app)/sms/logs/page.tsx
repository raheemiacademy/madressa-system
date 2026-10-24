import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { adminStaff, loginIdentity } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Chip } from '@/components/Chip';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { smsLogs } from '@/server/comm/sms';
import { CommTabs } from '../../newsletters/CommTabs';

export const metadata = { title: 'SMS logs' };
const KINDS = { contact: 'Contacts', teacher: 'Teachers', admin: 'Admin staff', number: 'Typed or CSV numbers' } as const;
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

export default async function SmsLogs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin('sms');
  const sp = await searchParams;
  const kind = sp.kind && sp.kind in KINDS ? sp.kind : undefined;
  const [rows, staff] = await Promise.all([
    smsLogs(db, { from: date(sp.from), to: date(sp.to), staff: Number(sp.staff) || undefined, kind, q: (sp.q ?? '').trim().slice(0, 60) || undefined }),
    db.select({ id: loginIdentity.id, name: adminStaff.name }).from(adminStaff).innerJoin(loginIdentity, eq(loginIdentity.adminStaffId, adminStaff.id)).where(isNull(adminStaff.deletedAt)).orderBy(asc(adminStaff.name))
  ]);
  const credits = rows.reduce((s, r) => s + (r.m.credits ?? 0), 0);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>SMS logs</h1><p>Every text queued or sent, newest first (latest 1,000)</p></div></div>
      <CommTabs admin={admin} current="/admin/sms/logs" />
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field"><label htmlFor="l-from">From</label><input className="ra-input" id="l-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="l-to">To</label><input className="ra-input" id="l-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="l-staff">Sent by</label><select className="ra-select" id="l-staff" name="staff" defaultValue={sp.staff ?? ''}><option value="">Anyone</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="l-kind">Recipient type</label><select className="ra-select" id="l-kind" name="kind" defaultValue={kind ?? ''}><option value="">Any</option>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="ra-field grow"><label htmlFor="l-q">Search</label><input className="ra-input" id="l-q" type="search" name="q" defaultValue={sp.q ?? ''} /></div>
        <button className="ra-btn">Filter</button>
      </form>
      <section className="ra-card" aria-label="Texts">
        {rows.length === 0 ? <p className="ra-empty">No texts match.</p> : (
          <>
            <p className="ra-note" style={{ margin: 0 }}>{rows.length === 1 ? '1 text' : `${rows.length} texts`} · {credits === 1 ? '1 credit' : `${credits} credits`} used</p>
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
              <thead><tr><th>Date</th><th>To</th><th>Message</th><th>Status</th><th>Sent by</th><th className="num">Credits</th></tr></thead>
              <tbody>{rows.map(({ m, staff: by }) => (
                <tr key={m.id}><td>{formatInstant(m.createdAt, 'dd/MM/yyyy HH:mm')}</td><td className="wrap">{m.recipientName ? `${m.recipientName} · ` : ''}{m.toNumber}</td>
                  <td className="wrap" style={{ maxWidth: '40ch' }}>{m.body}</td><td><Chip colour={m.status === 'sent' ? 'var(--color-ok)' : m.status === 'failed' ? 'var(--color-bad)' : 'var(--ra-blue)'}>{m.status === 'sent' ? 'Sent' : m.status === 'failed' ? 'Failed' : 'Queued'}</Chip>{m.error ? <div className="ra-note">{m.error}</div> : null}</td>
                  <td>{by ?? ''}</td><td className="num">{m.credits ?? ''}</td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </section>
    </div>
  );
}
