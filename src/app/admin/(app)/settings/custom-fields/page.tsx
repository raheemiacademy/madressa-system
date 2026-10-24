import { db } from '@/db';
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES } from '@/db/schema';
import { Check, SelectField, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { listFields, type CustomFieldDef } from '@/server/people/custom-fields';
import { deleteFieldAction, saveFieldAction } from '../people-actions';

export const metadata = { title: 'Custom fields' };
const ENTITY: Record<string, string> = { student: 'Students', teacher: 'Teachers', staff: 'Admin staff', contact: 'Contacts' };
const TYPE: Record<string, string> = { text: 'Text', multiline: 'Multiline text', number: 'Number', decimal: 'Decimal', date: 'Date', time: 'Time', radio: 'Radio options', checkboxes: 'Multiple-choice checkboxes' };

function Fields({ f }: { f?: CustomFieldDef }) {
  const p = f ? `cf${f.id}` : 'new';
  return (
    <>
      <div className="ra-fields">
        <SelectField id={`${p}e`} name="entity" label="For" defaultValue={f?.entity ?? 'student'} options={CUSTOM_FIELD_ENTITIES.map((e) => ({ value: e, label: ENTITY[e]! }))} />
        <TextField id={`${p}l`} name="label" label="Label" defaultValue={f?.label} />
        <TextField id={`${p}q`} name="question" label="Title or question" defaultValue={f?.question ?? ''} help="Shown on forms instead of the label, if given." />
        <SelectField id={`${p}t`} name="type" label="Type" defaultValue={f?.type ?? 'text'} options={CUSTOM_FIELD_TYPES.map((t) => ({ value: t, label: TYPE[t]! }))} />
        <TextField id={`${p}len`} name="maxLength" label="Maximum length" type="number" inputMode="numeric" defaultValue={f?.maxLength ?? ''} help="Text fields only." />
        <TextField id={`${p}dec`} name="decimals" label="Decimal places" type="number" inputMode="numeric" defaultValue={f?.decimals ?? ''} help="Decimal fields only." />
        <TextField id={`${p}o`} name="sortOrder" label="Order" type="number" inputMode="numeric" defaultValue={f?.sortOrder ?? 0} />
        <TextArea id={`${p}opts`} name="options" label="Options, one per line" defaultValue={f?.options.join('\n') ?? ''} rows={3} help="For radio and checkbox fields." />
      </div>
      <div className="ra-checks"><Check name="searchable" label="Searchable" defaultChecked={f?.searchable} /><Check name="onRegistration" label="Show on the registration page (students)" defaultChecked={f?.onRegistration} /></div>
    </>
  );
}

export default async function CustomFields() {
  await requireAdmin('super');
  const fields = await listFields(db);
  return (
    <>
      <section className="ra-card" aria-labelledby="cf-h">
        <div className="ra-card-h"><div><h2 id="cf-h">Custom fields</h2><div className="ra-note">Extra questions on student, teacher, admin staff and contact records.</div></div></div>
        {fields.length === 0 ? <p className="ra-empty">No custom fields yet.</p> : fields.map((f) => (
          <details key={f.id} className="ra-card" style={{ padding: 12, background: 'var(--ra-tint)' }}>
            <summary style={{ cursor: 'pointer' }}><b>{f.label}</b> <span className="ra-note">{ENTITY[f.entity]} · {TYPE[f.type]}{f.onRegistration ? ' · on registration page' : ''}</span></summary>
            <Form action={saveFieldAction.bind(null, f.id)} card={false} savebar={false}><Fields f={f} /></Form>
            <ActionButton className="ra-link" action={deleteFieldAction.bind(null, f.id)} label="Delete field and its answers" confirm={`Delete ${f.label} and every answer to it?`} danger />
          </details>
        ))}
      </section>
      <Form action={saveFieldAction.bind(null, undefined)} submit="Add field" resetOnSuccess><div className="ra-card-h"><div><h2>Add a custom field</h2></div></div><Fields /></Form>
    </>
  );
}
