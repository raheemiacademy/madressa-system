import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listEvents } from '@/server/learning/events';

export const metadata = { title: 'Events & trips' };

export default async function Events({ searchParams }: { searchParams: Promise<{ when?: string }> }) {
  const admin = await requireAdmin();
  const when = (await searchParams).when === 'previous' ? 'previous' : 'upcoming';
  const rows = await listEvents(db, when);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Events &amp; trips</h1><p>Families opt in, give consent and are invoiced automatically</p></div>
        <div className="ra-toolbar">{adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/events/new"><Icon name="plus" />Add event</Link>}</div></div>
      <nav className="ra-filters" aria-label="When">{(['upcoming', 'previous'] as const).map((w) => <Link key={w} className="ra-filter" aria-current={when === w ? 'page' : undefined} href={`?when=${w}`}>{w === 'upcoming' ? 'Upcoming' : 'Previous'}</Link>)}</nav>
      <section className="ra-card" aria-label="Events">
        {rows.length === 0 ? <p className="ra-empty">No {when} events.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Status</th><th>Date</th><th>Time</th><th>Event</th><th className="num">Price</th><th className="num">Timeslots</th><th>Auto-invoice</th><th className="num">Opt-ins</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.e.id}><td><Chip colour={r.e.active ? 'var(--color-ok)' : 'var(--color-fg-muted)'}>{r.e.active ? 'Active' : 'Closed'}</Chip></td><td>{formatCalendarDate(r.e.date)}</td><td>{r.e.time?.slice(0, 5) ?? ''}</td>
                <td className="wrap"><Link href={`/admin/events/${r.e.id}`}>{r.e.name}</Link></td><td className="num">{r.price ? formatPence(r.price) : 'Free'}</td><td className="num">{r.slots || ''}</td><td>{r.e.autoInvoice ? 'Yes' : 'No'}</td>
                <td className="num"><Link href={`/admin/events/${r.e.id}/opt-ins`}>{r.optIns}</Link></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
