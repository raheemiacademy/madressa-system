import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { AUDIENCES, listNewsletters } from '@/server/comm/newsletters';
import { CommTabs } from './CommTabs';

export const metadata = { title: 'Newsletters' };

export default async function Newsletters() {
  const admin = await requireAdmin();
  if (!adminCan(admin.staff, 'marketing')) redirect(adminCan(admin.staff, 'sms') ? '/admin/whatsapp' : '/admin/no-access');
  const rows = await listNewsletters(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Newsletters</h1><p>Email newsletters to parents, teachers and staff</p></div>
        <div className="ra-toolbar"><Link className="ra-btn primary" href="/admin/newsletters/new"><Icon name="plus" />New newsletter</Link></div></div>
      <CommTabs admin={admin} current="/admin/newsletters" />
      <section className="ra-card" aria-label="Newsletters">
        {rows.length === 0 ? <p className="ra-empty">No newsletters yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Created</th><th>Subject</th><th>Target</th><th>Last sent</th></tr></thead>
            <tbody>{rows.map((n) => (
              <tr key={n.id}><td>{formatInstant(n.createdAt, 'dd/MM/yyyy')}</td><td className="wrap"><Link href={`/admin/newsletters/${n.id}`}>{n.subject}</Link></td>
                <td className="wrap">{AUDIENCES[n.audience as keyof typeof AUDIENCES] ?? n.audience}</td>
                <td>{n.lastSentAt ? `${formatInstant(n.lastSentAt, 'dd/MM/yyyy HH:mm')} · ${n.lastSentCount === 1 ? '1 recipient' : `${n.lastSentCount} recipients`}` : <span className="ra-muted">Not sent</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
