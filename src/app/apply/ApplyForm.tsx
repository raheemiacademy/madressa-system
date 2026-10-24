'use client';

import { useActionState, useState } from 'react';
import { CustomFieldInputs, type CF } from '@/components/CustomFieldInputs';
import { FormErrors, SelectField, TextArea, TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { applyAction, type ApplyState } from './actions';

type Group = { id: number; name: string; description: string | null; required: boolean; multipleChoice: boolean };
type Opts = { kind: 'child' | 'adult'; groups: Group[]; fields: CF[]; require: { dob: boolean; mobile: boolean; address: boolean; emergency: boolean }; copySurname: boolean };
const GENDERS = ['Male', 'Female', 'Unspecified'].map((g) => ({ value: g, label: g }));

export function ApplyForm(o: Opts) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction.bind(null, o.kind), undefined);
  const [kids, setKids] = useState([0]);
  if (state?.ok) return (
    <div role="status" className="ra-form" style={{ textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 400, fontSize: 26, margin: 0 }}>Application sent</h2>
      <p style={{ margin: 0 }}>Thank you. {o.kind === 'adult' ? 'You are' : state.count === 1 ? 'Your child is' : 'Your children are'} now on our waiting list. The school office will be in touch.</p>
    </div>
  );
  const req = (on: boolean, label: string) => (on ? label : `${label} (optional)`);
  return (
    <form action={action} noValidate className="ra-form">
      <FormErrors.Provider value={state?.errors}>
        {state?.message && <div className="ra-banner ra-alert" role="alert"><div>{state.message}</div></div>}
        {/* Hidden from people; bots fill it in. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }}><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        {o.kind === 'adult' ? (
          <fieldset className="ra-fieldset"><legend>About you</legend>
            <div className="ra-fields">
              <TextField name="firstName" label="First name" autoComplete="given-name" required />
              <TextField name="surname" label="Surname" autoComplete="family-name" required />
              <TextField name="dob" label={req(o.require.dob, 'Date of birth')} type="date" autoComplete="bday" />
              <SelectField name="gender" label="Gender" options={GENDERS} defaultValue="Unspecified" />
              <TextField name="email" label="Email (optional)" type="email" inputMode="email" autoComplete="email" />
              <TextField name="mobile" label={req(o.require.mobile, 'Mobile')} type="tel" inputMode="tel" autoComplete="tel" />
              <TextField name="tel" label="Other phone (optional)" type="tel" inputMode="tel" />
              <TextField name="postcode" label={req(o.require.address, 'Postcode')} autoComplete="postal-code" />
              <TextArea name="address" label={req(o.require.address, 'Address')} autoComplete="street-address" rows={2} />
              <TextArea name="medical" label="Medical needs we should know about (optional)" rows={2} />
            </div>
            <Groups groups={o.groups} prefix="" />
            <CustomFieldInputs fields={o.fields} />
          </fieldset>
        ) : (
          <>
            <fieldset className="ra-fieldset"><legend>Parent or carer</legend>
              <div className="ra-fields">
                <TextField name="name" label="Full name" autoComplete="name" required />
                <TextField name="relation" label="Relation to the child (optional)" placeholder="e.g. Mother" />
                <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="email" />
                <TextField name="mobile" label={req(o.require.mobile, 'Mobile')} type="tel" inputMode="tel" autoComplete="tel" />
                <TextField name="tel" label="Other phone (optional)" type="tel" inputMode="tel" />
                <TextField name="postcode" label={req(o.require.address, 'Postcode')} autoComplete="postal-code" />
                <TextArea name="address" label={req(o.require.address, 'Address')} autoComplete="street-address" rows={2} />
              </div>
            </fieldset>
            <fieldset className="ra-fieldset"><legend>{o.require.emergency ? 'Emergency contact' : 'Emergency contact (optional)'}</legend>
              <div className="ra-fields">
                <TextField name="ecName" label="Name" autoComplete="off" />
                <TextField name="ecPhone" label="Phone" type="tel" inputMode="tel" autoComplete="off" />
                <TextField name="ecRelation" label="Relation" autoComplete="off" />
              </div>
            </fieldset>
            {kids.map((k, i) => {
              const p = `child.${k}.`;
              return (
                <fieldset key={k} className="ra-fieldset"><legend>Child {i + 1}</legend>
                  <div className="ra-fields">
                    <TextField id={`${p}fn`} name={`${p}firstName`} label="First name" autoComplete="off" />
                    <TextField id={`${p}sn`} name={`${p}surname`} label={o.copySurname ? 'Surname (if different from yours)' : 'Surname'} autoComplete="off" />
                    <TextField id={`${p}dob`} name={`${p}dob`} label={req(o.require.dob, 'Date of birth')} type="date" />
                    <SelectField id={`${p}g`} name={`${p}gender`} label="Gender" options={GENDERS} defaultValue="Unspecified" />
                    <TextArea id={`${p}m`} name={`${p}medical`} label="Medical needs we should know about (optional)" rows={2} />
                  </div>
                  <Groups groups={o.groups} prefix={p} />
                  <CustomFieldInputs fields={o.fields} prefix={p} />
                  {kids.length > 1 && <button type="button" className="ra-btn danger" onClick={() => setKids(kids.filter((x) => x !== k))}>Remove child {i + 1}</button>}
                </fieldset>
              );
            })}
            {kids.length < 8 && <div><button type="button" className="ra-btn" onClick={() => setKids([...kids, Math.max(...kids) + 1])}><Icon name="plus" />Add another child</button></div>}
          </>
        )}
        <button className="ra-btn primary" style={{ minHeight: 48 }} disabled={pending}>{pending ? 'Sending…' : 'Send application'}</button>
      </FormErrors.Provider>
    </form>
  );
}

function Groups({ groups, prefix }: { groups: Group[]; prefix: string }) {
  if (!groups.length) return null;
  const single = groups.every((g) => !g.multipleChoice);
  const name = `${prefix}groups`;
  return (
    <fieldset className="ra-fieldset ra-field full"><legend>Applying for</legend>
      <div className="ra-checks" style={{ gridTemplateColumns: '1fr' }}>
        {groups.map((g) => (
          <label key={g.id} className="ra-check"><input type={single ? 'radio' : 'checkbox'} name={name} value={g.id} />
            <span><b style={{ fontWeight: 500 }}>{g.name}</b>{g.required ? ' (required)' : ''}{g.description && <span className="ra-note" style={{ display: 'block' }}>{g.description}</span>}</span></label>
        ))}
      </div>
      <GroupError name={name} />
    </fieldset>
  );
}

function GroupError({ name }: { name: string }) {
  return <FormErrors.Consumer>{(e) => (e?.[name] ? <span className="err">{e[name]}</span> : null)}</FormErrors.Consumer>;
}
