import Link from 'next/link';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { diagnose } from '@/server/fees/reports';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Diagnose fees' };

/** §2 Diagnose Fees/Invoices: lists inconsistencies with a link to fix each one; it changes nothing itself. */
export default async function Diagnose() {
  await requireAdmin('fees');
  const problems = await diagnose(db);
  const kinds = [...new Set(problems.map((p) => p.kind))];
  return (
    <div className="ra-page">
      <FeesHead title="Diagnose fees and invoices" desc="Checks invoices and payments for problems: payments on deleted invoices, overpaid invoices, possible duplicates, billing after leaving and more." />
      {problems.length === 0 ? <div className="ra-card"><p className="ra-empty" role="status">No problems found.</p></div> : kinds.map((k) => {
        const mine = problems.filter((p) => p.kind === k);
        return (
          <section key={k} className="ra-card" aria-labelledby={`dg-${k}`}>
            <div className="ra-card-h"><div><h2 id={`dg-${k}`}>{k}</h2><div className="ra-note">{mine.length === 1 ? '1 found' : `${mine.length} found`}</div></div></div>
            <ul className="ra-list">{mine.map((p, i) => <li key={i}>{p.detail}{p.studentId ? <> · <Link className="ra-link" href={`/admin/fees/student/${p.studentId}`}>Open their fees</Link></> : null}</li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}
