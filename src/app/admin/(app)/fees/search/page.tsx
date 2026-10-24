import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { feesSearch } from '@/server/fees/reports';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Fees search' };

export default async function FeesSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin('fees');
  const q = ((await searchParams).q ?? '').trim();
  const r = await feesSearch(db, q);
  return (
    <div className="ra-page">
      <FeesHead title="Fees search" desc="Name, surname, date of birth (DD/MM/YYYY), part of the address, or #42 for an invoice" />
      <form className="ra-card ra-toolbar" role="search">
        <input className="ra-input grow" type="search" name="q" defaultValue={q} aria-label="Fees search" placeholder="e.g. Sample, 01/02/2015, AB1 or #42" />
        <button className="ra-btn primary">Search</button>
      </form>
      {!q ? <p className="ra-empty">Type something to search for.</p> : r.invoice ? (
        <section className="ra-card" aria-labelledby="inv-h">
          <div className="ra-card-h"><div><h2 id="inv-h">Invoice #{r.invoice.id}</h2><div className="ra-note">{r.invoice.studentName} · {r.invoice.description ?? r.invoice.type} · due {formatCalendarDate(r.invoice.dueDate)}</div></div><Chip>{r.invoice.status}</Chip></div>
          <p style={{ margin: 0 }}>{formatPence(r.invoice.amountPence)}, {formatPence(r.invoice.received)} received. <Link className="ra-link" href={`/admin/fees/student/${r.invoice.studentId}`}>Open their fees</Link></p>
        </section>
      ) : r.students.length === 0 ? <p className="ra-empty">Nothing matches “{q}”.</p> : (
        <section className="ra-card" aria-label="Students found">
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>#</th><th>Student</th><th>Date of birth</th><th>Postcode</th><th>Status</th></tr></thead>
            <tbody>{r.students.map((s) => <tr key={s.id}><td className="ra-muted">{s.id}</td><td className="wrap"><Link href={`/admin/fees/student/${s.id}`}>{s.firstName} {s.surname}</Link></td>
              <td>{s.dob ? formatCalendarDate(s.dob) : ''}</td><td>{s.postcode ?? ''}</td><td><Chip>{s.status}</Chip></td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}
