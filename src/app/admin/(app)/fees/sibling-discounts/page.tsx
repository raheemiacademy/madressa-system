import Link from 'next/link';
import { db } from '@/db';
import { SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatBps } from '@/lib/fees';
import { formatPence, penceToInput } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { describeAdjustment, families, listSets } from '@/server/fees/adjustments';
import { assignSiblingAction, deleteSetAction, saveSetAction } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Sibling discounts' };
const ORD = ['', '', '2nd', '3rd', '4th', '5th', '6th'];
type Rule = { position: number; kind: string; amount: number; unit: string };

function SetFields({ rules }: { rules: Rule[] }) {
  const positions = [2, 3, 4, 5, 6];
  return (
    <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
      <thead><tr><th>Sibling</th><th>Deduct or add</th><th>Amount</th><th>£ or %</th></tr></thead>
      <tbody>{positions.map((p) => {
        const r = rules.find((x) => x.position === p);
        return (
          <tr key={p}><td>{ORD[p]} child<input type="hidden" name="position" value={p} /></td>
            <td><select className="ra-select" name="ruleKind" aria-label={`${ORD[p]} child: deduct or add`} defaultValue={r?.kind ?? 'deduct'}><option value="deduct">Deduct</option><option value="add">Add</option></select></td>
            <td><input className="ra-input" name="ruleAmount" aria-label={`${ORD[p]} child: amount`} inputMode="decimal" defaultValue={r ? (r.unit === 'percent' ? String(r.amount / 100) : penceToInput(r.amount)) : ''} style={{ maxWidth: 120 }} /></td>
            <td><select className="ra-select" name="ruleUnit" aria-label={`${ORD[p]} child: pounds or percent`} defaultValue={r?.unit ?? 'percent'}><option value="percent">%</option><option value="pence">£</option></select></td></tr>
        );
      })}</tbody>
    </table></div>
  );
}

export default async function SiblingDiscounts() {
  const admin = await requireAdmin('fees');
  const [sets, fams] = await Promise.all([listSets(db), families(db)]);
  const canDelete = adminCan(admin.staff, 'delete');
  const show = (r: Rule) => `${ORD[r.position] ?? `${r.position}th`}: ${r.kind === 'deduct' ? '−' : '+'}${r.unit === 'percent' ? formatBps(r.amount) : formatPence(r.amount)}`;
  return (
    <div className="ra-page">
      <FeesHead title="Sibling discounts" desc="Discount sets by sibling position. The eldest current child pays full fees; later children get the set’s discount.">
        <Link className="ra-btn" href="/admin/fees/adjustments">Fees adjustments</Link>
        <Link className="ra-btn" href="/admin/students/siblings">Siblings</Link>
      </FeesHead>
      {sets.length === 0 ? <p className="ra-empty">No discount sets yet.</p> : sets.map((s) => (
        <details key={s.id} className="ra-card">
          <summary><b>{s.title}</b> <span className="ra-muted">{s.rules.map(show).join(' · ')}</span></summary>
          <Form action={saveSetAction.bind(null, s.id)} card={false} savebar={false} submit="Save set">
            <TextField name="title" id={`t-${s.id}`} label="Short title" defaultValue={s.title} />
            <SetFields rules={s.rules} />
          </Form>
          {canDelete && <ActionButton action={deleteSetAction.bind(null, s.id)} label="Delete set" danger confirm={`Delete the “${s.title}” set? Discounts already assigned stay until you change them.`} />}
        </details>
      ))}
      <Form action={saveSetAction.bind(null, null)} submit="Add discount set" resetOnSuccess>
        <div className="ra-card-h"><div><h2>New discount set</h2><div className="ra-note">Leave an amount blank for positions that get no discount. A child beyond the last position gets the last one’s discount.</div></div></div>
        <TextField name="title" label="Short title" />
        <SetFields rules={[]} />
      </Form>
      <section className="ra-card" aria-labelledby="fam-h">
        <div className="ra-card-h"><div><h2 id="fam-h">Siblings and their adjustments</h2><div className="ra-note">Current students linked as siblings, eldest first. Students with their own (manual) adjustment keep it.</div></div></div>
        {fams.length === 0 ? <p className="ra-empty">No current students are linked as siblings yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 520 }}><table className="ra-table">
            <thead><tr><th>Surname</th><th>Student</th><th>Position</th><th>Adjustment</th></tr></thead>
            <tbody>{fams.flatMap((f) => f.map((k, i) => (
              <tr key={k.id}><td>{i === 0 ? k.surname : ''}</td><td className="wrap"><Link href={`/admin/fees/student/${k.id}`}>{k.firstName} {k.surname}</Link></td>
                <td>{i === 0 ? 'Eldest' : ORD[i + 1] ?? `${i + 1}th`}</td><td>{describeAdjustment(k.a)}{k.a ? <span className="ra-muted"> · {k.a.source}</span> : null}</td></tr>
            )))}</tbody>
          </table></div>
        )}
        {sets.length > 0 && fams.length > 0 && (
          <Form action={assignSiblingAction} card={false} savebar={false} submit="Assign adjustments now">
            <SelectField name="setId" label="Discount set" options={sets.map((s) => ({ value: String(s.id), label: s.title }))} />
          </Form>
        )}
      </section>
    </div>
  );
}
