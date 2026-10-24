import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { student } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { requireAdmin } from '@/server/next/actor';
import { csvIds } from '@/server/people/csv';
import { FEE_COLUMNS } from '@/server/fees/imports';
import { ImportFlow } from '../../import/[kind]/ImportFlow';
import { commitFeeImport, previewFeeImport } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Import fees' };

export default async function ImportFees({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  await requireAdmin('fees');
  const check = ((await searchParams).check ?? '').slice(0, 2000);
  const ids = csvIds(check).slice(0, 200);
  const found = ids.length ? await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).where(inArray(student.id, ids)) : [];
  return (
    <div className="ra-page">
      <FeesHead title="Import fees" desc="Create or update invoices, and record payments, from a CSV file. Nothing is saved until you confirm the preview." />
      <div className="ra-grid">
        <form className="ra-card ra-form ra-c6" action="/admin/fees/import/template" method="get">
          <div className="ra-card-h"><div><h2>Download a template</h2><div className="ra-note">A blank sheet for new invoices, or this year’s invoices with their IDs to update or pay.</div></div></div>
          <div className="ra-fields">
            <div className="ra-field"><label htmlFor="t-mode">Rows</label><select className="ra-select" id="t-mode" name="mode"><option value="new">All new (blank template)</option><option value="unpaid">Unpaid invoices only</option><option value="all">All invoices</option></select></div>
            <div className="ra-field"><label htmlFor="t-format">Date format</label><select className="ra-select" id="t-format" name="format"><option value="uk">DD/MM/YYYY</option><option value="iso">YYYY-MM-DD</option></select></div>
            <div className="ra-field"><label htmlFor="t-from">Due from</label><input className="ra-input" id="t-from" type="date" name="from" /></div>
            <div className="ra-field"><label htmlFor="t-to">Due to</label><input className="ra-input" id="t-to" type="date" name="to" /></div>
          </div>
          <div className="ra-toolbar"><button className="ra-btn">Download template</button></div>
        </form>
        <form className="ra-card ra-form ra-c6" role="search">
          <div className="ra-card-h"><div><h2>Student ID checker</h2><div className="ra-note">Paste student IDs to see who they are before you import.</div></div></div>
          <div className="ra-field"><label htmlFor="chk">Student IDs</label><input className="ra-input" id="chk" name="check" defaultValue={check} placeholder="e.g. 12, 15, 18" /></div>
          <div className="ra-toolbar"><button className="ra-btn">Check</button></div>
          {ids.length > 0 && (
            <ul className="ra-list" aria-live="polite">{ids.map((id) => {
              const s = found.find((x) => x.id === id);
              return <li key={id}><span className="ra-muted">#{id}</span> {s ? <>{s.firstName} {s.surname} <Chip>{s.status}</Chip></> : <span className="ra-warn">No student with this ID</span>}</li>;
            })}</ul>
          )}
        </form>
      </div>
      <details className="ra-card">
        <summary className="ra-link" style={{ display: 'inline-grid' }}>Columns explained</summary>
        <table className="ra-table"><thead><tr><th>Column</th><th>Notes</th></tr></thead>
          <tbody>{FEE_COLUMNS.map((c) => <tr key={c.name}><td><code>{c.name}</code>{c.required ? ' (required)' : ''}</td><td className="wrap" style={{ maxWidth: '60ch' }}>{c.help}</td></tr>)}</tbody></table>
        <p className="ra-note">Amounts are in pounds. New invoices go into the year chosen in the top bar.</p>
      </details>
      <ImportFlow kind="fees" actions={{ preview: previewFeeImport, commit: commitFeeImport }} />
    </div>
  );
}
