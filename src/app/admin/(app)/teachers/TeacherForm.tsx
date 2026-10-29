'use client';

import { useState } from 'react';
import { CustomFieldInputs, type CF } from '@/components/CustomFieldInputs';
import { SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { saveTeacherAction } from './actions';
import { FileDrop } from '@/components/FileDrop';

export type TeacherValues = {
  id?: number; name: string; dob: string; gender: string; email: string; tel: string; mobile: string; status: string; startDate: string; leftDate: string;
  address: string; postcode: string; niNumber: string; dbsNumber: string; dbsIssuedOn: string; dbsExpiresOn: string; medical: string;
  bankName: string; bankAccount: string; bankSortCode: string; hasLogin: boolean; hasKioskPin: boolean; photo: string | null;
  emergency: { name: string; relation: string | null; phone: string | null }[];
};

export function TeacherForm({ t, statuses, genders, fields, answers }: { t: TeacherValues; statuses: string[]; genders: string[]; fields: CF[]; answers: Record<number, unknown> }) {
  const [ec, setEc] = useState(t.emergency.length ? t.emergency.map((e, i) => ({ ...e, key: i })) : [{ name: '', relation: '', phone: '', key: 0 }]);
  return (
    <Form action={saveTeacherAction.bind(null, t.id)} submit={t.id ? 'Save changes' : 'Add teacher'}>
      <div className="ra-card-h"><div><h2>Details</h2><div className="ra-note">NI number, bank details and medical information are encrypted.</div></div></div>
      <div className="ra-fields">
        <TextField name="name" label="Full name" defaultValue={t.name} autoComplete="off" required />
        <TextField name="dob" label="Date of birth" type="date" defaultValue={t.dob} />
        <SelectField name="gender" label="Gender" defaultValue={t.gender} options={genders.map((g) => ({ value: g, label: g }))} />
        <SelectField name="status" label="Status" defaultValue={t.status} options={statuses.map((s) => ({ value: s, label: s }))} />
        <TextField name="startDate" label="Start date" type="date" defaultValue={t.startDate} />
        <TextField name="leftDate" label="Left date" type="date" defaultValue={t.leftDate} />
        <TextField name="tel" label="Telephone" type="tel" inputMode="tel" defaultValue={t.tel} />
        <TextField name="mobile" label="Mobile" type="tel" inputMode="tel" defaultValue={t.mobile} />
        <TextField name="postcode" label="Postcode" defaultValue={t.postcode} />
        <TextArea name="address" label="Address" defaultValue={t.address} rows={2} />
      </div>
      <fieldset className="ra-fieldset"><legend>Teacher portal and kiosk</legend>
        <div className="ra-fields">
          <TextField name="email" label="Email (portal login)" type="email" inputMode="email" autoComplete="off" defaultValue={t.email} />
          <TextField name="password" label={t.hasLogin ? 'New portal password' : 'Portal password'} type="password" autoComplete="new-password" help={t.hasLogin ? 'Leave blank to keep it.' : 'At least 10 characters.'} />
          <TextField name="kioskPin" label={t.hasKioskPin ? 'New kiosk PIN' : 'Kiosk PIN'} type="password" inputMode="numeric" autoComplete="off" help={t.hasKioskPin ? 'Leave blank to keep it. 4 to 8 digits.' : '4 to 8 digits, for signing in and out at the kiosk.'} />
        </div>
      </fieldset>
      <fieldset className="ra-fieldset"><legend>Checks and pay</legend>
        <div className="ra-fields">
          <TextField name="niNumber" label="NI number" defaultValue={t.niNumber} autoCapitalize="characters" autoComplete="off" />
          <TextField name="dbsNumber" label="DBS number" defaultValue={t.dbsNumber} autoComplete="off" />
          <TextField name="dbsIssuedOn" label="DBS issue date" type="date" defaultValue={t.dbsIssuedOn} />
          <TextField name="dbsExpiresOn" label="DBS expiry date" type="date" defaultValue={t.dbsExpiresOn} />
          <TextField name="bankName" label="Bank account name" defaultValue={t.bankName} autoComplete="off" />
          <TextField name="bankAccount" label="Account number" inputMode="numeric" defaultValue={t.bankAccount} autoComplete="off" />
          <TextField name="bankSortCode" label="Sort code" inputMode="numeric" defaultValue={t.bankSortCode} autoComplete="off" />
          <TextArea name="medical" label="Medical information" defaultValue={t.medical} rows={2} />
        </div>
      </fieldset>
      <fieldset className="ra-fieldset"><legend>Emergency contacts</legend>
        {ec.map((e) => (
          <div key={e.key} className="ra-fields ra-link-row">
            <TextField id={`ec${e.key}n`} name="ec.name" label="Name" defaultValue={e.name} autoComplete="off" />
            <TextField id={`ec${e.key}r`} name="ec.relation" label="Relation" defaultValue={e.relation ?? ''} autoComplete="off" />
            <TextField id={`ec${e.key}p`} name="ec.phone" label="Phone" type="tel" defaultValue={e.phone ?? ''} autoComplete="off" />
            <div><button type="button" className="ra-btn danger" onClick={() => setEc(ec.filter((x) => x.key !== e.key))}>Remove</button></div>
          </div>
        ))}
        {ec.length < 5 && <button type="button" className="ra-btn" onClick={() => setEc([...ec, { name: '', relation: '', phone: '', key: Math.max(0, ...ec.map((x) => x.key)) + 1 }])}><Icon name="plus" />Add emergency contact</button>}
      </fieldset>
      <div className="ra-fields">
        <div className="ra-field">
          <label htmlFor="f-photo">Photo</label>
          {/* eslint-disable-next-line @next/next/no-img-element -- private uploaded photo */}
          {t.photo && <img className="ra-photo" src={`/admin/files/${t.photo}`} alt="Current photo" />}
          <FileDrop name="photo" id="f-photo" accept="image/png,image/jpeg,image/webp" />
        </div>
      </div>
      {fields.length > 0 && <fieldset className="ra-fieldset"><legend>More details</legend><CustomFieldInputs fields={fields} values={answers} /></fieldset>}
    </Form>
  );
}
