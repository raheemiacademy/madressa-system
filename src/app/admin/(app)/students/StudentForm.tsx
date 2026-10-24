'use client';

import { useContext, useState } from 'react';
import { CustomFieldInputs, type CF } from '@/components/CustomFieldInputs';
import { Check, FormErrors, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { searchContactsAction } from '../contacts/actions';
import { saveStudentAction } from './actions';

type Opt = { value: string; label: string };
export type ContactRow = { key: number; contactId: number | null; display: string; name: string; email: string; tel: string; mobile: string; altMobile: string; type: string; relation: string; isPrimary: boolean; portalAccess: boolean };
export type StudentValues = {
  id?: number; firstName: string; surname: string; dob: string; gender: string; email: string; hasLogin: boolean; tel: string; mobile: string; mobile2: string;
  address: string; postcode: string; status: string; startDate: string; leftDate: string; classId: string; medicalNotes: string; notes: string; photo: string | null;
};

export function StudentForm({ s, contacts, classes, statuses, genders, contactTypes, fields, answers, canFees }: {
  s: StudentValues; contacts: ContactRow[]; classes: Opt[]; statuses: string[]; genders: string[]; contactTypes: string[]; fields: CF[]; answers: Record<number, unknown>; canFees: boolean;
}) {
  return (
    <Form action={saveStudentAction.bind(null, s.id)} submit={s.id ? 'Save changes' : 'Add student'}>
      <div className="ra-card-h"><div><h2>Details</h2><div className="ra-note">Medical notes are encrypted and only shown to signed-in staff.</div></div></div>
      <div className="ra-fields">
        <TextField name="firstName" label="First name" defaultValue={s.firstName} autoComplete="off" required />
        <TextField name="surname" label="Surname" defaultValue={s.surname} autoComplete="off" required />
        <TextField name="dob" label="Date of birth" type="date" defaultValue={s.dob} />
        <SelectField name="gender" label="Gender" defaultValue={s.gender} options={genders.map((g) => ({ value: g, label: g }))} />
        <SelectField name="classId" label="Class" defaultValue={s.classId} options={[{ value: 'none', label: 'No class (waiting list)' }, ...classes]} help={s.id ? 'Changing it ends the old class today and starts the new one.' : undefined} />
        <SelectField name="status" label="Status" defaultValue={s.status} options={statuses.map((x) => ({ value: x, label: x }))} />
        <TextField name="startDate" label="Start date" type="date" defaultValue={s.startDate} />
        <TextField name="leftDate" label="Finish (left) date" type="date" defaultValue={s.leftDate} help="Filled with today when you choose a leaving status." />
        <Check name="deleteRegister" label="If leaving: delete register entries after the left date" />
        {canFees && <Check name="deleteInvoices" label="If leaving: delete unpaid invoices after the left date" />}
        {canFees && <Check name="admissionFee" label="Create an admission fee invoice" />}
      </div>
      <fieldset className="ra-fieldset"><legend>Contact details and address</legend>
        <div className="ra-fields">
          <TextField name="tel" label="Telephone" type="tel" inputMode="tel" defaultValue={s.tel} />
          <TextField name="mobile" label="Mobile" type="tel" inputMode="tel" defaultValue={s.mobile} />
          <TextField name="mobile2" label="Mobile 2" type="tel" inputMode="tel" defaultValue={s.mobile2} />
          <TextField name="postcode" label="Postcode" defaultValue={s.postcode} autoCapitalize="characters" />
          <TextArea name="address" label="Address" defaultValue={s.address} rows={2} />
        </div>
      </fieldset>
      <fieldset className="ra-fieldset"><legend>Student portal login</legend>
        <div className="ra-fields">
          <TextField name="email" label="Login email" type="email" inputMode="email" autoComplete="off" defaultValue={s.email} />
          <TextField name="password" label={s.hasLogin ? 'New password' : 'Password'} type="password" autoComplete="new-password" help={s.hasLogin ? 'Leave blank to keep the current one.' : 'At least 10 characters. Leave blank for no login yet.'} />
        </div>
      </fieldset>
      <div className="ra-fields">
        <TextArea name="medicalNotes" label="Medical notes" defaultValue={s.medicalNotes} rows={3} />
        <TextArea name="notes" label="General notes" defaultValue={s.notes} rows={3} />
        <div className="ra-field">
          <label htmlFor="f-photo">Photo</label>
          {/* eslint-disable-next-line @next/next/no-img-element -- private uploaded photo */}
          {s.photo && <img className="ra-photo" src={`/admin/files/${s.photo}`} alt="Current photo" />}
          <input className="ra-input" id="f-photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" style={{ paddingTop: 8 }} />
          <PhotoError />
        </div>
      </div>
      {fields.length > 0 && <fieldset className="ra-fieldset"><legend>More details</legend><CustomFieldInputs fields={fields} values={answers} /></fieldset>}
      <ContactsEditor initial={contacts} types={contactTypes} />
    </Form>
  );
}

function PhotoError() {
  const e = useContext(FormErrors)?.photo;
  return e ? <span className="err">{e}</span> : null;
}

function ContactsEditor({ initial, types }: { initial: ContactRow[]; types: string[] }) {
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(initial.length + 1);
  const errors = useContext(FormErrors);
  const blank = (key: number): ContactRow => ({ key, contactId: null, display: '', name: '', email: '', tel: '', mobile: '', altMobile: '', type: 'Parent', relation: '', isPrimary: rows.length === 0, portalAccess: true });
  const add = (row?: Partial<ContactRow>) => { setRows([...rows, { ...blank(next), ...row }]); setNext(next + 1); };
  return (
    <fieldset className="ra-fieldset">
      <legend>Contacts</legend>
      {errors?.contacts && <p className="err" role="alert" style={{ margin: '0 0 8px', color: 'var(--color-bad)', fontSize: 12 }}>{errors.contacts}</p>}
      {rows.length === 0 && <p className="ra-note" style={{ margin: 0 }}>No contacts yet. Add an existing contact or a new one.</p>}
      {rows.map((r, i) => {
        const p = `contacts.${i}.`;
        const e = (k: string) => errors?.[`${p}${k}`];
        return (
          <div key={r.key} style={{ borderTop: i ? '1px solid var(--ra-hairline)' : undefined, paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0 }}>
            {r.contactId ? <><input type="hidden" name={`${p}contactId`} value={r.contactId} /><p style={{ margin: '0 0 8px', fontWeight: 500 }}>{r.display}</p></> : (
              <div className="ra-fields">
                <TextField id={`c${r.key}n`} name={`${p}name`} label="Name" defaultValue={r.name} error={e('name')} autoComplete="off" />
                <TextField id={`c${r.key}e`} name={`${p}email`} label="Email" type="email" defaultValue={r.email} error={e('email')} autoComplete="off" />
                <TextField id={`c${r.key}t`} name={`${p}tel`} label="Telephone" type="tel" defaultValue={r.tel} />
                <TextField id={`c${r.key}m`} name={`${p}mobile`} label="Mobile" type="tel" defaultValue={r.mobile} />
                <TextField id={`c${r.key}a`} name={`${p}altMobile`} label="Alt mobile" type="tel" defaultValue={r.altMobile} />
              </div>
            )}
            <div className="ra-fields" style={{ alignItems: 'end' }}>
              <SelectField id={`c${r.key}ty`} name={`${p}type`} label="Type" defaultValue={r.type} options={types.map((t) => ({ value: t, label: t }))} />
              <TextField id={`c${r.key}r`} name={`${p}relation`} label="Relation" defaultValue={r.relation} placeholder="e.g. Mother" />
              <label className="ra-check"><input type="checkbox" name={`${p}isPrimary`} defaultChecked={r.isPrimary} /><span>Primary contact</span></label>
              <label className="ra-check"><input type="checkbox" name={`${p}portalAccess`} defaultChecked={r.portalAccess} /><span>Can see this child on the parent portal</span></label>
              <div><button type="button" className="ra-btn danger" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button></div>
            </div>
          </div>
        );
      })}
      <div className="ra-toolbar" style={{ marginTop: 12 }}>
        <button type="button" className="ra-btn" onClick={() => add()}><Icon name="plus" />New contact</button>
        <ContactSearch onPick={(c) => add({ contactId: c.id, display: c.label })} exclude={rows.map((r) => r.contactId).filter((x): x is number => !!x)} />
      </div>
    </fieldset>
  );
}

function ContactSearch({ onPick, exclude }: { onPick: (c: { id: number; label: string }) => void; exclude: number[] }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: number; label: string }[] | null>(null);
  const search = async () => { if (q.trim().length >= 2) setHits(await searchContactsAction(q)); };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <label className="sr-only" htmlFor="contact-search">Find an existing contact</label>
      <input id="contact-search" className="ra-input" style={{ width: 240 }} placeholder="Find an existing contact" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} />
      <button type="button" className="ra-btn" onClick={search}>Find</button>
      {hits && (
        <ul aria-live="polite" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
          {hits.filter((h) => !exclude.includes(h.id)).length === 0 ? <li className="ra-note">No contacts match.</li>
            : hits.filter((h) => !exclude.includes(h.id)).map((h) => <li key={h.id}><button type="button" className="ra-filter" onClick={() => { onPick(h); setHits(null); setQ(''); }}>{h.label}</button></li>)}
        </ul>
      )}
    </div>
  );
}
