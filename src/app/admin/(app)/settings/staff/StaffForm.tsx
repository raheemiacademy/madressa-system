'use client';

import { useActionState } from 'react';
import { Check, FormMessage, TextField } from '@/components/Fields';
import { SaveBar } from '@/components/SaveBar';
import { ACCESS_LEVELS } from '@/lib/access-levels';
import type { FormState } from '@/lib/validate';
import { saveStaffAction } from './actions';

export type StaffValues = {
  id: number; name: string; email: string; phone: string | null; mobile: string | null; rank: string | null; role: string | null;
  dbsNumber: string | null; dbsIssuedOn: string | null; dbsExpiresOn: string | null;
  isSuper: boolean; canEdit: boolean; canDelete: boolean; feesAccess: boolean; marketing: boolean; sendSms: boolean;
  allowLogin: boolean; hasPassword: boolean;
};

export function StaffForm({ staff: s, ranks }: { staff?: StaffValues; ranks: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStaffAction.bind(null, s?.id), undefined);
  const e = (n: string) => state?.errors?.[n];
  return (
    <form className="ra-card ra-form" action={action} noValidate>
      <div className="ra-card-h"><div><h2>{s ? `Edit ${s.name}` : 'Add admin staff'}</h2><div className="ra-note">Their email is their admin login.</div></div></div>
      <FormMessage state={state} />
      <div className="ra-fields">
        <TextField name="name" label="Name" defaultValue={s?.name} error={e('name')} required autoComplete="off" />
        <TextField name="email" label="Email (login)" type="email" inputMode="email" defaultValue={s?.email} error={e('email')} required autoComplete="off" />
        <TextField name="password" label={s?.hasPassword ? 'New password' : 'Password'} type="password" autoComplete="new-password" error={e('password')}
          help={s?.hasPassword ? 'Leave blank to keep the current password. At least 10 characters.' : 'At least 10 characters.'} />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={s?.phone ?? ''} error={e('phone')} />
        <TextField name="mobile" label="Mobile" type="tel" inputMode="tel" defaultValue={s?.mobile ?? ''} error={e('mobile')} />
        <TextField name="rank" label="Rank" list="ranks" defaultValue={s?.rank ?? ''} error={e('rank')} help="Pick one or type your own." />
        <datalist id="ranks">{ranks.map((r) => <option key={r} value={r} />)}</datalist>
        <TextField name="role" label="Role" defaultValue={s?.role ?? ''} error={e('role')} />
        <TextField name="dbsNumber" label="DBS number" defaultValue={s?.dbsNumber ?? ''} error={e('dbsNumber')} />
        <TextField name="dbsIssuedOn" label="DBS issue date" type="date" defaultValue={s?.dbsIssuedOn ?? ''} error={e('dbsIssuedOn')} />
        <TextField name="dbsExpiresOn" label="DBS expiry date" type="date" defaultValue={s?.dbsExpiresOn ?? ''} error={e('dbsExpiresOn')} />
      </div>
      <Check name="allowLogin" label="Allow login" defaultChecked={s?.allowLogin ?? true} error={e('allowLogin')} />
      <fieldset className="ra-fieldset"><legend>Access levels</legend>
        <div className="ra-checks">
          {ACCESS_LEVELS.map(([k, l]) => <Check key={k} name={k} label={l} defaultChecked={s?.[k]} error={e(k)} />)}
        </div>
      </fieldset>
      <SaveBar pending={pending} state={state} label={s ? 'Save changes' : 'Add staff member'} />
    </form>
  );
}
