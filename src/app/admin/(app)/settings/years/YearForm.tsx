'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Check, FormMessage, TextField } from '@/components/Fields';
import { SaveBar } from '@/components/SaveBar';
import type { FormState } from '@/lib/validate';
import { saveYearAction } from './actions';

type Y = { id: number; title: string; startsOn: string; endsOn: string; isCurrent: boolean };

export function YearForm({ year }: { year?: Y }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveYearAction.bind(null, year?.id), undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && !year) form.current?.reset(); }, [state, year]);
  const e = (n: string) => state?.errors?.[n];
  return (
    <form ref={form} className="ra-card ra-form" action={action} noValidate>
      <div className="ra-card-h"><div>
        <h2>{year ? `Edit ${year.title}` : 'Start a new year'}</h2>
        <div className="ra-note">{year ? 'Change the title or dates.' : 'Step 1 of the new year wizard: set the year’s dates.'}</div>
      </div></div>
      <FormMessage state={state} />
      <div className="ra-fields">
        <TextField name="title" label="Title" placeholder="2027/28" defaultValue={year?.title} error={e('title')} required />
        <TextField name="startsOn" label="Starts" type="date" defaultValue={year?.startsOn} error={e('startsOn')} required />
        <TextField name="endsOn" label="Ends" type="date" defaultValue={year?.endsOn} error={e('endsOn')} required />
      </div>
      <Check name="makeCurrent" label="Make this the current year" defaultChecked={year?.isCurrent} />
      <SaveBar pending={pending} state={state} label={year ? 'Save changes' : 'Add year'} />
    </form>
  );
}
