import Link from 'next/link';
import { db } from '@/db';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { annualTotal, periodsOf, structureByClass } from '@/server/fees/structures';
import { yearAndClasses } from '../../students/year-classes';
import { generateAction } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Generate invoices' };
const SCOPE = [{ value: 'today', label: 'Invoices dated up to today' }, { value: 'year', label: 'The full year now' }];

export default async function Generate() {
  await requireAdmin('fees');
  const { year } = await yearAndClasses();
  const byClass = year ? await structureByClass(db, year.id) : new Map();
  const periods = await periodsOf(db, [...new Set([...byClass.values()].map((c) => c.structure?.id).filter((x): x is number => !!x))]);
  const rows = [...byClass.entries()].map(([id, c]) => ({ id, ...c, total: c.structure ? annualTotal(periods.filter((p) => p.structureId === c.structure!.id)) : 0 }));
  return (
    <div className="ra-page">
      <FeesHead title="Generate invoices" desc={`Create fees invoices from each class’s fees structure${year ? ` for ${year.title}` : ''}`}>
        <Link className="ra-btn" href="/admin/fees/structure">Fees structure</Link>
      </FeesHead>
      {!year ? <p className="ra-empty">Add an academic year first.</p> : (
        <>
          <section className="ra-card" aria-labelledby="cls-h">
            <div className="ra-card-h"><div><h2 id="cls-h">What each class is billed</h2><div className="ra-note">A class uses its own structure, otherwise the year’s default</div></div></div>
            {rows.length === 0 ? <p className="ra-empty">No classes set up for this year yet.</p> : (
              <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
                <thead><tr><th>Class</th><th>Structure</th><th className="num">Per student per year</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.id}><td className="wrap">{r.className}</td><td className="wrap">{r.structure ? `${r.structure.name}${r.own ? '' : ' (default)'}` : <span className="ra-warn">None: not billed</span>}</td><td className="num">{r.structure ? formatPence(r.total) : '—'}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
          <Form action={generateAction.bind(null, false)} submit="Generate missing invoices now">
            <div className="ra-card-h"><div><h2>Generate missing invoices</h2><div className="ra-note">Safe to run any time: invoices that already exist, or that you deleted, are never created again. Standing adjustments and sibling discounts are applied.</div></div></div>
            <div className="ra-fields"><SelectField name="scope" label="Create" options={SCOPE} /></div>
            <Check name="activeOnly" label="Active (Current) students only" />
          </Form>
          <section id="force">
            <Form action={generateAction.bind(null, true)} submit="Force generate invoices">
              <div className="ra-card-h"><div><h2>Force generate invoices</h2><div className="ra-note">As above, but invoices you deleted are brought back with today’s amounts. Invoices never appear twice.</div></div></div>
              <div className="ra-fields"><SelectField name="scope" id="force-scope" label="Create" options={SCOPE} /></div>
              <Check name="activeOnly" label="Active (Current) students only" />
              <TextField name="confirmName" id="force-confirm" label="Type the school name to confirm" autoComplete="off" />
            </Form>
          </section>
        </>
      )}
    </div>
  );
}
