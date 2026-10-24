import { db } from '@/db';
import { GENDERS } from '@/db/schema';
import { CustomFieldInputs } from '@/components/CustomFieldInputs';
import { Check, Checks, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { answersFor } from '@/server/people/custom-fields';
import { listGroups } from '@/server/people/contacts';
import { saveContactAction } from './actions';

type C = { id: number; name: string; email: string | null; tel: string | null; mobile: string | null; altMobile: string | null; address: string | null; postcode: string | null; gender: string | null; active: boolean; groups: { id: number }[]; hasPassword: boolean };

export async function ContactForm({ c }: { c?: C }) {
  const [groups, cf] = await Promise.all([listGroups(db), answersFor(db, 'contact', c?.id ?? 0)]);
  return (
    <Form action={saveContactAction.bind(null, c?.id)} submit={c ? 'Save changes' : 'Add contact'}>
      <div className="ra-fields">
        <TextField name="name" label="Name" defaultValue={c?.name} autoComplete="off" required />
        <SelectField name="gender" label="Gender" defaultValue={c?.gender ?? ''} options={[{ value: '', label: 'Not given' }, ...GENDERS.map((g) => ({ value: g, label: g }))]} help="Used for the same-gender messaging route." />
        <TextField name="email" label="Email (parent portal login)" type="email" inputMode="email" defaultValue={c?.email ?? ''} autoComplete="off" />
        <TextField name="password" label={c?.hasPassword ? 'Reset portal password' : 'Set portal password'} type="password" autoComplete="new-password" help={c?.hasPassword ? 'Leave blank to keep it.' : 'At least 10 characters. Leave blank and they can be sent a link later.'} />
        <TextField name="tel" label="Telephone" type="tel" inputMode="tel" defaultValue={c?.tel ?? ''} />
        <TextField name="mobile" label="Mobile" type="tel" inputMode="tel" defaultValue={c?.mobile ?? ''} />
        <TextField name="altMobile" label="Alt mobile" type="tel" inputMode="tel" defaultValue={c?.altMobile ?? ''} />
        <TextField name="postcode" label="Postcode" defaultValue={c?.postcode ?? ''} />
        <TextArea name="address" label="Address" defaultValue={c?.address ?? ''} rows={2} />
      </div>
      <Checks name="groups" legend="Groups" options={groups.map((g) => ({ value: String(g.id), label: g.name }))} checked={(c?.groups ?? []).map((g) => String(g.id))} />
      <div className="ra-fields"><TextField name="newGroup" label="Or add to a new group" placeholder="e.g. Parents" /></div>
      <Check name="active" label="Active" defaultChecked={c?.active ?? true} />
      <CustomFieldInputs fields={cf.fields} values={cf.values} />
    </Form>
  );
}
