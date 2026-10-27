import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { classAssignment, INVOICE_TYPES, invoice, student } from '@/db/schema';
import { formatPence } from '@/lib/money';
import { isoDate } from '@/lib/validate';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { invoiceRows, totals } from '@/server/fees/invoices';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';
import { InvoiceTable } from '../InvoiceTable';

export const metadata = { title: 'All invoices' };
const STATUSES = { '': 'Any status', unpaid: 'Still to pay', Overdue: 'Overdue', Balance: 'Not yet due', Paid: 'Paid' } as const;
const ORDERS = { due: 'Due date: newest first', 'due-old': 'Due date: oldest first', name: 'Student name A–Z', high: 'Amount: high to low', low: 'Amount: low to high', balance: 'Balance: most owed first' } as const;
const LIMIT = 2000;
const filters = z.object({
  q: z.string().trim().max(60).catch(''),
  type: z.enum(INVOICE_TYPES).optional().catch(undefined),
  status: z.enum(['', 'unpaid', 'Overdue', 'Balance', 'Paid']).catch(''),
  class: z.coerce.number().int().positive().optional().catch(undefined),
  from: isoDate.optional().catch(undefined), to: isoDate.optional().catch(undefined),
  order: z.enum(['due', 'due-old', 'name', 'high', 'low', 'balance']).catch('due')
});
const sel = (name: string, label: string, options: [string, string][], value: string) => (
  <div className="ra-field"><label htmlFor={`i-${name}`}>{label}</label>
    <select className="ra-select" id={`i-${name}`} name={name} defaultValue={value}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
);

/** Every invoice this year, from the Fees dashboard's "Invoiced" tile: filter by student, type, status, class or due date, and sort. */
export default async function Invoices({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin('fees');
  const f = filters.parse(await searchParams);
  const { year, options } = await yearAndClasses();
  const today = todayIso();
  const inClass = f.class ? (await db.select({ id: classAssignment.studentId }).from(classAssignment)
    .where(and(eq(classAssignment.classId, f.class), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today))))).map((r) => r.id) : null;
  const all = year ? await invoiceRows(db, and(
    eq(invoice.academicYearId, year.id),
    f.type ? eq(invoice.type, f.type) : undefined,
    f.from ? gte(invoice.dueDate, f.from) : undefined, f.to ? lte(invoice.dueDate, f.to) : undefined,
    inClass ? (inClass.length ? inArray(invoice.studentId, inClass) : sql`false`) : undefined,
    f.q ? sql`lower(${student.firstName} || ' ' || ${student.surname}) like ${`%${f.q.toLowerCase()}%`}` : undefined
  )) : [];
  const matched = all.filter((r) => !f.status || (f.status === 'unpaid' ? r.status !== 'Paid' : r.status === f.status));
  const by = { due: (a: typeof matched[number], b: typeof matched[number]) => b.dueDate.localeCompare(a.dueDate) || b.id - a.id,
    'due-old': (a: typeof matched[number], b: typeof matched[number]) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id,
    name: (a: typeof matched[number], b: typeof matched[number]) => a.studentName.localeCompare(b.studentName, 'en-GB') || a.dueDate.localeCompare(b.dueDate),
    high: (a: typeof matched[number], b: typeof matched[number]) => b.amountPence - a.amountPence,
    low: (a: typeof matched[number], b: typeof matched[number]) => a.amountPence - b.amountPence,
    balance: (a: typeof matched[number], b: typeof matched[number]) => b.balance - a.balance }[f.order];
  const rows = [...matched].sort(by);
  const t = totals(rows);
  return (
    <div className="ra-page">
      <FeesHead title="All invoices" desc={`Every invoice${year ? ` for ${year.title}` : ''}. Filter and sort them here.`} />
      <form className="ra-card ra-form" role="search">
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="i-q">Student name</label><input className="ra-input" id="i-q" type="search" name="q" defaultValue={f.q} autoComplete="off" /></div>
          {sel('type', 'Type', [['', 'All types'], ...INVOICE_TYPES.map((x) => [x, x] as [string, string])], f.type ?? '')}
          {sel('status', 'Status', Object.entries(STATUSES), f.status)}
          {sel('class', 'Class', [['', 'All classes'], ...options.map((o) => [o.value, o.label] as [string, string])], f.class ? String(f.class) : '')}
          <div className="ra-field"><label htmlFor="i-from">Due from</label><input className="ra-input" id="i-from" type="date" name="from" defaultValue={f.from ?? ''} /></div>
          <div className="ra-field"><label htmlFor="i-to">Due to</label><input className="ra-input" id="i-to" type="date" name="to" defaultValue={f.to ?? ''} /></div>
          {sel('order', 'Sort by', Object.entries(ORDERS), f.order)}
        </div>
        <div className="ra-toolbar"><button className="ra-btn primary">Show invoices</button></div>
      </form>
      <section className="ra-card" aria-labelledby="inv-h">
        <div className="ra-card-h"><div><h2 id="inv-h">{rows.length === 1 ? '1 invoice' : `${rows.length.toLocaleString('en-GB')} invoices`}</h2>
          <div className="ra-note">{formatPence(t.due)} invoiced · {formatPence(t.received)} received · {formatPence(t.outstanding)} still to pay{rows.length > LIMIT ? ` · showing the first ${LIMIT.toLocaleString('en-GB')}` : ''}</div></div></div>
        <InvoiceTable rows={rows.slice(0, LIMIT)} empty={year ? 'No invoices match these filters.' : 'Add an academic year first.'} />
      </section>
    </div>
  );
}
