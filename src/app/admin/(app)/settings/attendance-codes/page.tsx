import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceCode, CODE_TYPES } from '@/db/schema';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { readTab } from '@/server/settings';
import { saveCodeAction } from '../../register/actions';

export const metadata = { title: 'Attendance codes' };
const TYPE: Record<string, string> = { present: 'Present', approved: 'Approved educational activity', authorised: 'Authorised absence', unauthorised: 'Unauthorised absence', not_counted: 'Not counted' };

export default async function Codes() {
  await requireAdmin('super');
  const [codes, reg] = await Promise.all([db.select().from(attendanceCode).orderBy(asc(attendanceCode.sortOrder)), readTab(db, 'register')]);
  const fields = (c?: typeof codes[number]) => {
    const p = c ? `c${c.sortOrder}` : 'new';
    return (
      <>
        <div className="ra-fields">
          {!c && <TextField id={`${p}c`} name="code" label="Code" maxLength={3} />}
          <TextField id={`${p}d`} name="description" label="Description" defaultValue={c?.description} />
          <SelectField id={`${p}t`} name="type" label="Type" defaultValue={c?.type ?? 'present'} options={CODE_TYPES.map((t) => ({ value: t, label: TYPE[t]! }))} />
          <TextField id={`${p}k`} name="keys" label="Keyboard key" defaultValue={c?.keys ?? ''} maxLength={5} />
          <TextField id={`${p}o`} name="sortOrder" label="Order" type="number" defaultValue={c?.sortOrder ?? codes.length + 1} />
        </div>
        <div className="ra-checks"><Check name="isLate" label="Counts as late" defaultChecked={c?.isLate} /><Check name="active" label="Active" defaultChecked={c?.active ?? true} /></div>
      </>
    );
  };
  return (
    <>
      <section className="ra-card" aria-labelledby="ac-h">
        <div className="ra-card-h"><div><h2 id="ac-h">DfE attendance codes</h2><div className="ra-note">Used when Settings → Register is set to DfE codes. It’s currently set to <b>{reg.type === 'dfe' ? 'DfE codes' : 'classic'}</b>.</div></div></div>
        {codes.map((c) => (
          <details key={c.code} className="ra-card" style={{ padding: 12, background: 'var(--ra-tint)' }}>
            <summary style={{ cursor: 'pointer' }}><b>{c.code}</b> {c.description} <span className="ra-note">{TYPE[c.type]}{c.isLate ? ' · late' : ''}{c.active ? '' : ' · off'}</span></summary>
            <Form action={saveCodeAction.bind(null, c.code)} card={false} savebar={false}>{fields(c)}</Form>
          </details>
        ))}
      </section>
      <Form action={saveCodeAction.bind(null, null)} submit="Add code" resetOnSuccess><div className="ra-card-h"><div><h2>Add a code</h2></div></div>{fields()}</Form>
    </>
  );
}
