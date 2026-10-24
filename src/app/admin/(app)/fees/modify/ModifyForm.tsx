'use client';

import { useActionState } from 'react';
import { FormErrors, FormMessage, SelectField, TextField } from '@/components/Fields';
import { modifyAction, type ModifyState } from '../actions';

/** §2 Modify Invoices: "where current invoices =" → "set invoices to", previewed before anything changes. */
export function ModifyForm({ types }: { types: readonly string[] }) {
  const [state, act, pending] = useActionState<ModifyState, FormData>(modifyAction, undefined);
  const good = state?.preview?.filter((p) => !p.problem).length ?? 0;
  return (
    <form action={act} className="ra-card ra-form" noValidate>
      <FormErrors.Provider value={state?.errors}>
        <FormMessage state={state} />
        {state?.ok && <p className="ra-banner ra-success" role="status" style={{ margin: 0 }}>{state.message}</p>}
        <fieldset className="ra-fieldset"><legend>Where current invoices =</legend>
          <div className="ra-fields">
            <SelectField name="type" label="Type" options={[{ value: '', label: 'Any type' }, ...types.map((t) => ({ value: t, label: t }))]} />
            <TextField name="whereAmount" label="Amount (£)" inputMode="decimal" autoComplete="off" />
            <TextField name="whereDue" label="Due date" type="date" />
            <TextField name="wherePeriodFrom" label="Period from" type="date" />
            <TextField name="wherePeriodTo" label="Period to" type="date" />
          </div>
        </fieldset>
        <fieldset className="ra-fieldset"><legend>Set invoices to</legend>
          <div className="ra-fields">
            <TextField name="setAmount" label="Amount (£)" inputMode="decimal" autoComplete="off" />
            <TextField name="setDue" label="Due date" type="date" />
            <TextField name="setPeriodFrom" label="Period from" type="date" />
            <TextField name="setPeriodTo" label="Period to" type="date" />
          </div>
        </fieldset>
        <div className="ra-toolbar">
          <button className="ra-btn" name="apply" value="0" disabled={pending}>{pending ? 'Working…' : 'Preview modifications'}</button>
          {state?.preview && good > 0 && <button className="ra-btn primary" name="apply" value="1" disabled={pending}>Apply to {good === 1 ? '1 invoice' : `${good} invoices`}</button>}
        </div>
        {state?.preview && (state.preview.length === 0 ? <p className="ra-empty" role="status">No invoices this year match.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 520 }} role="region" aria-label="Preview"><table className="ra-table">
            <thead><tr><th>Inv.</th><th>Student</th><th>Description</th><th>Now</th><th>Becomes</th></tr></thead>
            <tbody>{state.preview.map((p) => (
              <tr key={p.id}><td className="ra-muted">#{p.id}</td><td className="wrap">{p.student}</td><td className="wrap">{p.description}</td><td className="wrap">{p.from}</td>
                <td className="wrap">{p.problem ? <span className="ra-warn">Skipped: {p.problem}</span> : p.from === p.to ? 'No change' : p.to}</td></tr>
            ))}</tbody>
          </table></div>
        ))}
      </FormErrors.Provider>
    </form>
  );
}
