import { cookies } from 'next/headers';
import Link from 'next/link';
import { db } from '@/db';
import { PAYMENT_STATUSES } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { FeesChart } from '@/components/charts';
import { HideFeesToggle } from '@/components/HideFeesToggle';
import { Icon } from '@/components/Icon';
import { HIDE_FEES_COOKIE } from '@/lib/hide-fees';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { dashboard, paymentList } from '@/server/fees/reports';
import { annualTotal, periodsOf, structureByClass } from '@/server/fees/structures';
import { yearAndClasses } from '../students/year-classes';
import { FeesHead } from './FeesHead';
import { MORE_TOOLS } from './tools';

export const metadata = { title: 'Fees' };
const FILTERS = ['All', 'Cleared', 'Pending', 'Processing', 'Bounced'] as const;

export default async function Fees({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const status = (PAYMENT_STATUSES as readonly string[]).includes(sp.status ?? '') ? sp.status as (typeof PAYMENT_STATUSES)[number] : undefined;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const { year } = await yearAndClasses();
  const hidden = !!(await cookies()).get(HIDE_FEES_COOKIE)?.value;
  // Hidden figures aren't fetched at all, so they can't be read from the page.
  const [d, pays, byClass] = hidden ? [null, [], new Map()] : await Promise.all([year ? dashboard(db, year.id) : null, paymentList(db, { status, q: q || undefined, limit: 100 }), year ? structureByClass(db, year.id) : new Map()]);
  const periods = await periodsOf(db, [...new Set([...byClass.values()].map((c) => c.structure?.id).filter((x): x is number => !!x))]);
  const classFees = [...byClass.entries()].map(([id, c]) => ({ id, name: c.className, structure: c.structure, own: c.own, perYear: c.structure ? annualTotal(periods.filter((p) => p.structureId === c.structure!.id)) : null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true }));
  const t = d?.totals;
  const share = t && t.due ? `${((t.received / t.due) * 100).toFixed(1)}%` : '—';
  return (
    <div className="ra-page">
      <FeesHead title="Fees" desc={`Invoices, payments and reminders${year ? ` for ${year.title}` : ''}`} back={false}>
        <Link className="ra-btn" href="/admin/fees/generate">Generate invoices</Link>
        <Link className="ra-btn" href="/admin/fees/monthly">Monthly invoices</Link>
        <Link className="ra-btn" href="/admin/fees/reminders">Send reminders</Link>
        {!hidden && <HideFeesToggle hidden={false} className="ra-btn" />}
      </FeesHead>

      {hidden && <div className="ra-banner" role="status" style={{ ['--c' as string]: 'var(--ra-lav)' }}><div><b>Fee figures are hidden on this device.</b> Totals, the chart and payments are left out until you show them again.</div><HideFeesToggle hidden className="ra-link" /></div>}

      {!year ? <p className="ra-empty">Add an academic year first.</p> : d && (
        <div className="ra-kpis">
          {/* Each figure opens the list behind it. */}
          <Link className="ra-kpi ra-kpi-link" href="/admin/fees/invoices" style={{ ['--c' as string]: 'var(--ra-indigo)' }}><div className="ra-kpi-top">Invoiced</div><div className="ra-kpi-val">{formatPence(t!.due)}</div><div className="ra-kpi-sub">All invoice types</div></Link>
          <Link className="ra-kpi ra-kpi-link" href="/admin/fees/received" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div className="ra-kpi-top">Received</div><div className="ra-kpi-val">{formatPence(t!.received)}</div><div className="ra-kpi-sub">{share} collected</div></Link>
          <Link className="ra-kpi ra-kpi-link" href="/admin/fees/reminders?show=all" style={{ ['--c' as string]: 'var(--ra-violet)' }}><div className="ra-kpi-top">Outstanding</div><div className="ra-kpi-val">{formatPence(t!.outstanding)}</div><div className="ra-kpi-sub">Includes upcoming</div></Link>
          <Link className="ra-kpi ra-kpi-link" href="/admin/fees/reminders?show=overdue" style={{ ['--c' as string]: 'var(--color-bad)' }}><div className="ra-kpi-top">Overdue invoices</div><div className="ra-kpi-val">{d!.overdueCount}</div><div className="ra-kpi-sub">{d!.overdueCount ? `${formatPence(t!.overdue)} past its due date` : 'Nothing past its due date'}</div></Link>
        </div>
      )}

      <div className="ra-more"><span className="ra-more-l">More tools</span>
        {MORE_TOOLS.map(([h, l]) => <Link key={h} className="ra-btn" href={h}>{l}</Link>)}
      </div>

      <form className="ra-card ra-toolbar" role="search" action="/admin/fees/search">
        <div className="ra-field grow"><label htmlFor="fees-q">Fees search</label>
          <input id="fees-q" className="ra-input" type="search" name="q" placeholder="Name, surname, DOB (DD/MM/YYYY), part of the address, or #42 for an invoice" /></div>
        <button className="ra-btn">Search</button>
      </form>

      {d && (
        <div className="ra-grid">
          <div className="ra-c8 ra-stack">
          <section className="ra-card" aria-labelledby="fm-h">
            <div className="ra-card-h"><div><h2 id="fm-h">Invoiced vs received by month</h2><div className="ra-note">Last six months, all types</div></div></div>
            <div className="ra-legend"><span><i style={{ background: 'var(--ra-lav)' }} />Invoiced</span><span><i style={{ background: 'var(--ra-indigo)' }} />Received</span></div>
            <FeesChart data={d.monthly} />
          </section>
          <section className="ra-card" aria-labelledby="ft-h">
            <div className="ra-card-h"><div><h2 id="ft-h">Totals by type</h2><div className="ra-note">This academic year</div></div></div>
            {d.byType.length === 0 ? <p className="ra-empty">No invoices this year yet.</p> : (
              <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
                <thead><tr><th>Type</th><th className="num">Total</th><th className="num">Received</th><th className="num">Outstanding</th></tr></thead>
                <tbody>{d.byType.map((r) => <tr key={r.type}><td>{r.type}</td><td className="num">{formatPence(r.due)}</td><td className="num">{formatPence(r.received)}</td><td className="num">{formatPence(r.outstanding)}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
          </div>
          <section className="ra-card ra-c4" aria-labelledby="cf-h">
            <div className="ra-card-h"><div><h2 id="cf-h">Class fees</h2><div className="ra-note">Full year, per student</div></div><Link className="ra-link" href="/admin/fees/structure">Fees structure</Link></div>
            {classFees.length === 0 ? <p className="ra-empty">No classes set up for this year yet.</p> : (
              <ul className="ra-classfees">
                {classFees.map((c) => (
                  <li key={c.id}>
                    <span><Link className="ra-classfees-name" href={`/admin/fees/overview?class=${c.id}`}><b>{c.name}</b></Link><small>{c.structure ? `${c.structure.name}${c.own ? '' : ' (default)'}` : 'Not billed'}</small></span>
                    <span className="num">{c.perYear === null ? '—' : formatPence(c.perYear)}</span>
                    {c.structure
                      ? <Link className="ra-btn" href={`/admin/fees/structure/${c.structure.id}`} aria-label={`Edit fees for ${c.name}${c.own ? '' : ' (the default structure, shared with other classes)'}`}><Icon name="edit" />Edit</Link>
                      : <Link className="ra-btn" href={`/admin/classes/${c.id}#class-fees`} aria-label={`Set fees for ${c.name}`}><Icon name="plus" />Set fees</Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {!hidden && <section className="ra-card" aria-labelledby="pay-h">
        <div className="ra-card-h"><div><h2 id="pay-h">Payments</h2><div className="ra-note">Search by name, payment ID or method</div></div>
          <nav className="ra-filters" aria-label="Payment status">{FILTERS.map((f) => {
            const on = (f === 'All' && !status) || f === status;
            return <Link key={f} className="ra-filter" aria-current={on ? 'page' : undefined} href={`?${new URLSearchParams({ ...(f !== 'All' ? { status: f } : {}), ...(q ? { q } : {}) })}`}>{f}</Link>;
          })}</nav></div>
        <form className="ra-toolbar" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <input className="ra-input grow" type="search" name="q" defaultValue={q} placeholder="Name, surname or #payment ID" aria-label="Search payments" style={{ maxWidth: 340 }} />
          <button className="ra-btn">Search</button>
          <Link className="ra-link" href="/admin/fees/received">View all</Link>
        </form>
        {pays.length === 0 ? <p className="ra-empty">{q || status ? 'No payments match.' : 'No payments recorded yet.'}</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Payment</th><th>Date</th><th>Student</th><th>Type</th><th className="num">Amount</th><th>Method</th><th>Status</th><th><span className="sr-only">Receipt</span></th></tr></thead>
            <tbody>{pays.map((p) => (
              <tr key={p.id}>
                <td className="ra-muted">#{p.id}</td><td>{formatCalendarDate(p.receivedOn)}</td>
                <td className="wrap"><Link href={`/admin/fees/student/${p.studentId}`}>{p.studentName}</Link></td><td>{p.type}</td>
                <td className="num">{formatPence(p.amountPence)}</td><td>{p.method}</td><td><Chip>{p.status}</Chip></td>
                <td><span className="ra-acts"><Link href={`/admin/fees/receipt/${p.id}`} aria-label={`Receipt for payment #${p.id}`} title="Receipt"><Icon name="receipt" /></Link></span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>}
    </div>
  );
}
