import Link from 'next/link';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { invoice, student } from '@/db/schema';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { familyOf } from '@/server/fees/adjustments';
import { invoiceRows, totals } from '@/server/fees/invoices';
import { feesSearch } from '@/server/fees/reports';
import { AddFeesButton } from '../AddFees';
import { FeesHead } from '../FeesHead';
import { InvoiceTable } from '../InvoiceTable';

export const metadata = { title: 'Combined sibling fees' };

/** §2 Combined Sibling Fees: a family's invoices together, for a parent paying for all their children at once. */
export default async function Family({ searchParams }: { searchParams: Promise<{ student?: string; q?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const sid = Number(sp.student) || null;
  const q = (sp.q ?? '').trim();
  const found = !sid && q ? (await feesSearch(db, q)).students : [];
  const [s] = sid ? await db.select().from(student).where(eq(student.id, sid)).limit(1) : [];
  const fam = s ? await familyOf(db, s.id) : [];
  const rows = fam.length ? (await invoiceRows(db, inArray(invoice.studentId, fam.map((f) => f.id)))).filter((r) => r.balance > 0) : [];
  const t = totals(rows);
  return (
    <div className="ra-page">
      <FeesHead title="Combined sibling fees" desc="A family’s outstanding invoices together. Add fees can split one payment across all of them, oldest first." />
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field grow"><label htmlFor="fam-q">Find a student in the family</label><input className="ra-input" id="fam-q" type="search" name="q" defaultValue={q} /></div>
        <button className="ra-btn">Find</button>
      </form>
      {!s && q && (found.length === 0 ? <p className="ra-empty">No students match.</p> : (
        <ul className="ra-list">{found.map((f) => <li key={f.id}><Link href={`?student=${f.id}`}>{f.firstName} {f.surname}</Link> <span className="ra-muted">#{f.id} · {f.status}</span></li>)}</ul>
      ))}
      {s && (
        <section className="ra-card" aria-labelledby="fam-h">
          <div className="ra-card-h"><div><h2 id="fam-h">{s.surname} family</h2>
            <div className="ra-note">{fam.map((f) => `${f.firstName} ${f.surname}`).join(', ')}{fam.length === 1 ? ' (no siblings linked)' : ''} · {formatPence(t.outstanding)} outstanding, {formatPence(t.overdue)} overdue</div></div>
            <AddFeesButton student={{ id: s.id, name: `${s.firstName} ${s.surname}` }} label="Pay for the family" /></div>
          <div className="ra-toolbar">{fam.map((f) => <Link key={f.id} className="ra-btn" href={`/admin/fees/student/${f.id}`}>{f.firstName}’s fees</Link>)}</div>
          <InvoiceTable rows={rows} empty="Nothing outstanding for this family." />
        </section>
      )}
    </div>
  );
}
