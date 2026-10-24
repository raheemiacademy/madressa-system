import Link from 'next/link';
import { db } from '@/db';
import { INVOICE_TYPES } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { annual } from '@/server/fees/reports';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Annual report' };
const BY = { invoices: 'By invoices', students: 'By students', contacts: 'By contacts' } as const;

export default async function Annual({ searchParams }: { searchParams: Promise<{ by?: string; type?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const by = (sp.by && sp.by in BY ? sp.by : 'invoices') as keyof typeof BY;
  const type = (INVOICE_TYPES as readonly string[]).includes(sp.type ?? '') ? sp.type as (typeof INVOICE_TYPES)[number] : undefined;
  const { year } = await yearAndClasses();
  const r = year ? await annual(db, year.id, type) : null;
  const q = (v: Record<string, string | undefined>) => new URLSearchParams(Object.entries({ by, type, ...v }).filter(([, x]) => x) as [string, string][]).toString();
  const groups = r ? (by === 'students' ? r.students : r.contacts) : [];
  return (
    <div className="ra-page">
      <FeesHead title="Annual report" desc={`Invoices, received and balance${year ? ` for ${year.title}` : ''}`}>
        <Link className="ra-btn" href="/admin/fees/generate">Generate missing invoices now</Link>
        <Link className="ra-btn" href="/admin/fees/generate#force">Force generate invoices</Link>
        <a className="ra-btn" href={`/admin/fees/annual/export?${q({})}`}>Download CSV</a>
      </FeesHead>
      <nav className="ra-filters" aria-label="Report">{Object.entries(BY).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={by === k ? 'page' : undefined} href={`?${q({ by: k })}`}>{l}</Link>)}</nav>
      <nav className="ra-filters" aria-label="Invoice type">
        <Link className="ra-filter" aria-current={!type ? 'page' : undefined} href={`?${q({ type: undefined })}`}>All types</Link>
        {INVOICE_TYPES.map((t) => <Link key={t} className="ra-filter" aria-current={type === t ? 'page' : undefined} href={`?${q({ type: t })}`}>{t}</Link>)}
      </nav>
      {!r ? <p className="ra-empty">Add an academic year first.</p> : (
        <section className="ra-card" aria-labelledby="an-h">
          <div className="ra-card-h"><div><h2 id="an-h">{BY[by]}</h2><div className="ra-note">{plural(r.invoices.length, 'invoice')} · {formatPence(r.totals.due)} invoiced · {formatPence(r.totals.received)} received · {formatPence(r.totals.outstanding)} outstanding</div></div></div>
          {r.invoices.length === 0 ? <p className="ra-empty">No invoices{type ? ` of type ${type}` : ''} this year yet.</p> : by === 'invoices' ? (
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
              <thead><tr><th>Inv. ID</th><th>St. ID</th><th>Student name</th><th>Period / description</th><th>Due date</th><th className="num">Amount</th><th className="num">Received</th><th className="num">Balance</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{r.invoices.map((i) => (
                <tr key={i.id}><td className="ra-muted">#{i.id}</td><td className="ra-muted">{i.studentId}</td><td className="wrap"><Link href={`/admin/fees/student/${i.studentId}`}>{i.studentName}</Link></td>
                  <td className="wrap">{i.periodFrom ? `${formatCalendarDate(i.periodFrom)} to ${i.periodTo ? formatCalendarDate(i.periodTo) : ''}` : i.description ?? i.type}</td><td>{formatCalendarDate(i.dueDate)}</td>
                  <td className="num">{formatPence(i.amountPence)}</td><td className="num">{formatPence(i.received)}</td><td className="num">{formatPence(i.balance)}</td><td><Chip>{i.status}</Chip></td>
                  <td><Link className="ra-link" href={`/admin/fees/invoice?edit=${i.id}`}>Edit</Link></td></tr>
              ))}</tbody>
            </table></div>
          ) : (
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
              <thead><tr><th>{by === 'students' ? 'Student' : 'Contact'}</th><th className="num">Invoices</th><th className="num">Total</th><th className="num">Received</th><th className="num">Balance</th></tr></thead>
              <tbody>{groups.map((g) => (
                <tr key={`${g.id}-${g.name}`}><td className="wrap">{g.id ? <Link href={by === 'students' ? `/admin/fees/student/${g.id}` : `/admin/contacts/${g.id}`}>{g.name}</Link> : g.name}</td>
                  <td className="num">{g.count}</td><td className="num">{formatPence(g.total)}</td><td className="num">{formatPence(g.received)}</td><td className="num">{formatPence(g.balance)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}
    </div>
  );
}
