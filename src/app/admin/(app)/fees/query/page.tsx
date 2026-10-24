import { z } from 'zod';
import { db } from '@/db';
import { INVOICE_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/db/schema';
import { plusMonths } from '@/lib/fees';
import { isoDate } from '@/lib/validate';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { paymentList } from '@/server/fees/reports';
import { FeesHead } from '../FeesHead';
import { PaymentsTable } from '../PaymentsTable';

export const metadata = { title: 'Query fees' };
const RANGES = { '': 'Any time', '1': 'Last month', '3': 'Last 3 months', '6': 'Last 6 months', '12': 'Last 12 months' } as const;
const ORDERS = { recent: 'Date received: most recent first', oldest: 'Date received: oldest first', name: 'Student name A–Z', low: 'Amount: low to high', high: 'Amount: high to low' } as const;
const filters = z.object({
  from: isoDate.optional().catch(undefined), to: isoDate.optional().catch(undefined),
  range: z.enum(['', '1', '3', '6', '12']).catch(''),
  id: z.string().regex(/^#?\d{1,9}$/).optional().catch(undefined),
  type: z.enum(INVOICE_TYPES).optional().catch(undefined), status: z.enum(PAYMENT_STATUSES).optional().catch(undefined), method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
  order: z.enum(['recent', 'oldest', 'name', 'low', 'high']).catch('recent')
});
const sel = (name: string, label: string, options: [string, string][], value: string) => (
  <div className="ra-field"><label htmlFor={`q-${name}`}>{label}</label>
    <select className="ra-select" id={`q-${name}`} name={name} defaultValue={value}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
);

export default async function QueryFees({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin('fees');
  const raw = await searchParams;
  const f = filters.parse(raw);
  const asked = Object.values(raw).some(Boolean);
  const today = todayIso();
  const from = f.range ? plusMonths(today, -Number(f.range)) : f.from;
  const rows = asked ? await paymentList(db, { from, to: f.range ? today : f.to, id: f.id ? Number(f.id.replace('#', '')) : undefined, type: f.type, status: f.status, method: f.method, order: f.order, limit: 2000 }) : [];
  return (
    <div className="ra-page">
      <FeesHead title="Query fees" desc="Find payments by date, ID or receipt number, type, status or method" />
      <form className="ra-card ra-form" role="search">
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="q-from">Date from</label><input className="ra-input" id="q-from" type="date" name="from" defaultValue={f.from ?? ''} /></div>
          <div className="ra-field"><label htmlFor="q-to">Date to</label><input className="ra-input" id="q-to" type="date" name="to" defaultValue={f.to ?? ''} /></div>
          {sel('range', 'Or a past range', Object.entries(RANGES), f.range)}
          <div className="ra-field"><label htmlFor="q-id">Payment ID or receipt number</label><input className="ra-input" id="q-id" name="id" inputMode="numeric" defaultValue={f.id ?? ''} /></div>
          {sel('type', 'Type', [['', 'All types'], ...INVOICE_TYPES.map((t) => [t, t] as [string, string])], f.type ?? '')}
          {sel('status', 'Status', [['', 'Any status'], ...PAYMENT_STATUSES.map((t) => [t, t] as [string, string])], f.status ?? '')}
          {sel('method', 'Method', [['', 'Any method'], ...PAYMENT_METHODS.map((t) => [t, t] as [string, string])], f.method ?? '')}
          {sel('order', 'Order by', Object.entries(ORDERS), f.order)}
        </div>
        <div className="ra-toolbar"><button className="ra-btn primary" name="go" value="1">Search</button></div>
      </form>
      {asked && <section className="ra-card" aria-label="Results"><PaymentsTable rows={rows} empty="No payments match these filters." /></section>}
    </div>
  );
}
