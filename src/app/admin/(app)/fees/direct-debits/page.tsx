import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { requireAdmin } from '@/server/next/actor';
import { readTab } from '@/server/settings';
import { directDebits } from '@/server/fees/reports';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Direct debit stats' };
const SHOW = { all: 'Show all', active: 'Who is active', inactive: 'Who is inactive' } as const;

export default async function DirectDebits({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const show = (sp.show && sp.show in SHOW ? sp.show : 'all') as keyof typeof SHOW;
  const [rows, gw] = await Promise.all([directDebits(db, show), readTab(db, 'gateways')]);
  return (
    <div className="ra-page">
      <FeesHead title="Direct debit stats" desc="Which current students have a parent paying by direct debit">
        <Link className="ra-btn" href="/admin/settings/gateways">Payment gateways</Link>
      </FeesHead>
      <div className="ra-banners"><div className="ra-banner"><div>GoCardless (direct debit): <b>{gw.gocardlessEnabled ? `on, ${gw.gocardlessEnvironment === 'live' ? 'live' : 'sandbox'}` : 'off'}</b> · Stripe (card): <b>{gw.stripeEnabled ? 'on' : 'off'}</b>. Parents set up direct debits from the parent portal; statuses update from GoCardless.</div></div></div>
      <nav className="ra-filters" aria-label="Show">{Object.entries(SHOW).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={show === k ? 'page' : undefined} href={`?show=${k}`}>{l}</Link>)}</nav>
      <section className="ra-card" aria-label="Students">
        {rows.length === 0 ? <p className="ra-empty">{show === 'active' ? 'No students have an active direct debit yet.' : show === 'inactive' ? 'Every current student has an active direct debit.' : 'No current students.'}</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 700 }}><table className="ra-table">
            <thead><tr><th>Student</th><th>Class</th><th>Direct debit</th><th>Contacts with a direct debit</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td className="wrap"><Link href={`/admin/fees/student/${r.id}`}>{r.name}</Link></td><td className="wrap">{r.classes ?? ''}</td>
              <td><Chip colour={r.active ? 'var(--color-ok)' : 'var(--color-fg-muted)'}>{r.active ? 'Active' : 'Inactive'}</Chip></td>
              <td className="wrap">{[...r.contacts, ...r.other].join(', ') || <span className="ra-muted">None</span>}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
