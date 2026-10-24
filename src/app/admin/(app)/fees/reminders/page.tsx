import Link from 'next/link';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { classAssignment, INVOICE_TYPES } from '@/db/schema';
import { formatPence, parsePounds } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { reminders } from '@/server/fees/reports';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';
import { InvoiceTable } from '../InvoiceTable';

export const metadata = { title: 'Outstanding and reminders' };
const SHOW = { overdue: 'Overdue', active: 'Active', upcoming: 'Upcoming', all: 'All' } as const;
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

export default async function Reminders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const show = (sp.show && sp.show in SHOW ? sp.show : 'overdue') as keyof typeof SHOW;
  const type = (INVOICE_TYPES as readonly string[]).includes(sp.type ?? '') ? sp.type as (typeof INVOICE_TYPES)[number] : undefined;
  const min = sp.min ? parsePounds(sp.min) ?? undefined : undefined;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month : undefined;
  const classId = Number(sp.class) || undefined;
  const studentId = Number(sp.student) || undefined;
  const { options } = await yearAndClasses();
  const today = todayIso();
  const studentIds = classId ? (await db.select({ id: classAssignment.studentId }).from(classAssignment)
    .where(and(eq(classAssignment.classId, classId), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today))))).map((r) => r.id)
    : studentId ? [studentId] : undefined;
  const rows = await reminders(db, { show, type, min, month, from: date(sp.from), to: date(sp.to), studentIds });
  const total = rows.reduce((s, r) => s + r.balance, 0);
  const students = new Set(rows.map((r) => r.studentId)).size;
  const keep = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ ...sp, ...v }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <div className="ra-page">
      <FeesHead title="Outstanding and reminders" desc="Invoices with something still to pay. Overdue: past due. Active: due within a week or past. Upcoming: not yet due." />
      <nav className="ra-filters" aria-label="Show">{Object.entries(SHOW).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={show === k ? 'page' : undefined} href={keep({ show: k })}>{l}</Link>)}</nav>
      <form className="ra-card ra-form" role="search">
        <input type="hidden" name="show" value={show} />
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="r-type">Type</label><select className="ra-select" id="r-type" name="type" defaultValue={type ?? ''}><option value="">All types</option>{INVOICE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="ra-field"><label htmlFor="r-min">Minimum balance (£)</label><input className="ra-input" id="r-min" name="min" inputMode="decimal" defaultValue={sp.min ?? ''} /></div>
          <div className="ra-field"><label htmlFor="r-month">Due in month</label><input className="ra-input" id="r-month" type="month" name="month" defaultValue={month ?? ''} /></div>
          <div className="ra-field"><label htmlFor="r-from">Due from</label><input className="ra-input" id="r-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
          <div className="ra-field"><label htmlFor="r-to">Due to</label><input className="ra-input" id="r-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
          <div className="ra-field"><label htmlFor="r-class">Class</label><select className="ra-select" id="r-class" name="class" defaultValue={classId ? String(classId) : ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div className="ra-field"><label htmlFor="r-student">Student ID</label><input className="ra-input" id="r-student" name="student" inputMode="numeric" defaultValue={studentId ?? ''} /></div>
        </div>
        <div className="ra-toolbar"><button className="ra-btn primary">Prepare list</button></div>
      </form>
      <form className="ra-card ra-form" action="/admin/fees/reminders/export" method="get">
        <div className="ra-card-h"><div><h2>{rows.length === 1 ? '1 invoice' : `${rows.length} invoices`} · {students === 1 ? '1 student' : `${students} students`} · {formatPence(total)} to pay</h2>
          <div className="ra-note">Untick any invoice you don’t want to include. Emailing reminders (with the editable template and an optional direct-debit setup link) arrives with the mail queue in Phase 5.</div></div></div>
        <InvoiceTable rows={rows} select="ids" empty="Nothing outstanding matches these filters." />
        {rows.length > 0 && <div className="ra-toolbar"><button className="ra-btn">Download the prepared list (CSV)</button></div>}
      </form>
    </div>
  );
}
