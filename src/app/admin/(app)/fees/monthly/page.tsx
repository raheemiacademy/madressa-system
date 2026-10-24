import Link from 'next/link';
import { db } from '@/db';
import { INVOICE_TYPES } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { plusMonths } from '@/lib/fees';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { monthly } from '@/server/fees/reports';
import { FeesHead } from '../FeesHead';
import { InvoiceTable } from '../InvoiceTable';

export const metadata = { title: 'Monthly fees' };

export default async function Monthly({ searchParams }: { searchParams: Promise<{ month?: string; type?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? sp.month! : todayIso().slice(0, 7);
  const type = (INVOICE_TYPES as readonly string[]).includes(sp.type ?? '') ? sp.type as (typeof INVOICE_TYPES)[number] : undefined;
  const { rows, totals } = await monthly(db, month, type);
  const q = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ month, type, ...v }).filter(([, x]) => x) as [string, string][])}`;
  const kpi = (k: string, v: number) => <div className="ra-kpi"><div className="ra-kpi-top">{k}</div><div className="ra-kpi-val">{formatPence(v)}</div></div>;
  return (
    <div className="ra-page">
      <FeesHead title="Monthly fees" desc="Invoices dated in a month, with what has cleared and what is still to pay" />
      <nav className="ra-toolbar" aria-label="Month">
        <Link className="ra-btn" href={q({ month: plusMonths(`${month}-01`, -1).slice(0, 7) })}>Previous month</Link>
        <form style={{ display: 'contents' }}>{type && <input type="hidden" name="type" value={type} />}
          <input className="ra-input" type="month" name="month" defaultValue={month} aria-label="Month" style={{ maxWidth: 180 }} /><button className="ra-btn">Show</button></form>
        <Link className="ra-btn" href={q({ month: plusMonths(`${month}-01`, 1).slice(0, 7) })}>Next month</Link>
      </nav>
      <nav className="ra-filters" aria-label="Invoice type">
        <Link className="ra-filter" aria-current={!type ? 'page' : undefined} href={q({ type: undefined })}>All types</Link>
        {INVOICE_TYPES.map((t) => <Link key={t} className="ra-filter" aria-current={type === t ? 'page' : undefined} href={q({ type: t })}>{t}</Link>)}
      </nav>
      <div className="ra-kpis">{kpi('Total amount', totals.due)}{kpi('Total cleared', totals.received)}{kpi('Total pending', totals.pending)}{kpi('Total outstanding', totals.outstanding)}</div>
      <section className="ra-card" aria-labelledby="m-h">
        <div className="ra-card-h"><div><h2 id="m-h">{formatCalendarDate(`${month}-01`, 'MMMM yyyy')}</h2></div></div>
        <InvoiceTable rows={rows} empty="No invoices dated in this month." />
      </section>
    </div>
  );
}
