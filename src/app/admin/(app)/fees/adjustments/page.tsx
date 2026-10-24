import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adjustmentList, describeAdjustment } from '@/server/fees/adjustments';
import { yearAndClasses } from '../../students/year-classes';
import { adjustmentsAction } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Fees adjustments' };

export default async function Adjustments({ searchParams }: { searchParams: Promise<{ q?: string; class?: string; without?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const classId = Number(sp.class) || undefined;
  const without = sp.without === '1';
  const q = (sp.q ?? '').trim().slice(0, 60);
  const [{ options }, rows] = await Promise.all([yearAndClasses(), adjustmentList(db, { classId, q, without })]);
  return (
    <div className="ra-page">
      <FeesHead title="Fees adjustments" desc="A standing deduction, addition or free place per student. It applies to fees invoices generated from now on.">
        <Link className="ra-btn" href="/admin/fees/sibling-discounts">Set sibling discounts</Link>
      </FeesHead>
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field grow"><label htmlFor="adj-q">Student</label><input className="ra-input" id="adj-q" type="search" name="q" defaultValue={q} /></div>
        <div className="ra-field"><label htmlFor="adj-class">Class</label><select className="ra-select" id="adj-class" name="class" defaultValue={classId ? String(classId) : ''}><option value="">All current students</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <label className="ra-check"><input type="checkbox" name="without" value="1" defaultChecked={without} /><span>Only students with no adjustment</span></label>
        <button className="ra-btn">Find</button>
      </form>
      {rows.length === 0 ? <p className="ra-empty">{without ? 'Every matching student has an adjustment.' : 'No students match.'}</p> : (
        <Form action={adjustmentsAction} submit="Apply to selected" savebar={false}>
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 560 }}><table className="ra-table">
            <thead><tr><th><span className="sr-only">Select</span></th><th>Student</th><th>Status</th><th>Adjustment</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td><input type="checkbox" name="studentIds" value={r.id} aria-label={`Select ${r.firstName} ${r.surname}`} /></td>
                <td className="wrap"><Link href={`/admin/fees/student/${r.id}`}>{r.firstName} {r.surname}</Link></td><td><Chip>{r.status}</Chip></td>
                <td>{describeAdjustment(r.a)}{r.a?.source === 'sibling' ? <span className="ra-muted"> · sibling discount</span> : null}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="ra-fields">
            <SelectField name="kind" label="Adjustment" options={[{ value: 'deduct', label: 'Deduct' }, { value: 'add', label: 'Add' }, { value: 'free', label: 'Free (no fees)' }, { value: 'remove', label: 'Remove adjustment' }]} />
            <TextField name="amount" label="Amount" inputMode="decimal" help="e.g. 5 or 12.5" autoComplete="off" />
            <SelectField name="unit" label="Unit" options={[{ value: 'pence', label: '£' }, { value: 'percent', label: '%' }]} />
          </div>
        </Form>
      )}
    </div>
  );
}
