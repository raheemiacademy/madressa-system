'use client';

import { useActionState, useEffect, useRef, useTransition } from 'react';
import { Check, Checks, FormErrors, FormMessage, TextArea, TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { SaveBar } from '@/components/SaveBar';
import type { FormState } from '@/lib/validate';
import { deleteHolidayAction, saveHolidayAction } from './actions';

type H = { id: number; title: string; description: string | null; startsOn: string; endsOn: string; showTeacher: boolean; showParent: boolean; showStudent: boolean; studentsAttend: boolean; teachersAttend: boolean; allClasses: boolean };

export function HolidayForm({ yearId, yearTitle, holiday: h, classes, chosen }: { yearId: number; yearTitle: string; holiday?: H; classes: { value: string; label: string }[]; chosen: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHolidayAction.bind(null, h?.id), undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && !h) form.current?.reset(); }, [state, h]);
  const e = (n: string) => state?.errors?.[n];
  return (
    <form ref={form} className="ra-card ra-form" action={action} noValidate>
      <div className="ra-card-h"><div><h2>{h ? `Edit ${h.title}` : 'Add a holiday'}</h2><div className="ra-note">For {yearTitle}</div></div></div>
      <FormMessage state={state} />
      <input type="hidden" name="academicYearId" value={yearId} />
      <div className="ra-fields">
        <TextField name="title" label="Title" defaultValue={h?.title} error={e('title')} required full />
        <TextField name="startsOn" label="Starts" type="date" defaultValue={h?.startsOn} error={e('startsOn')} required />
        <TextField name="endsOn" label="Ends" type="date" defaultValue={h?.endsOn} error={e('endsOn')} required />
        <TextArea name="description" label="Description" defaultValue={h?.description ?? ''} error={e('description')} rows={3} />
      </div>
      <fieldset className="ra-fieldset"><legend>Show on</legend>
        <div className="ra-checks">
          <Check name="showTeacher" label="Teacher portal" defaultChecked={h?.showTeacher ?? true} />
          <Check name="showParent" label="Parent portal" defaultChecked={h?.showParent ?? true} />
          <Check name="showStudent" label="Student portal" defaultChecked={h?.showStudent ?? true} />
        </div>
      </fieldset>
      <fieldset className="ra-fieldset"><legend>Who still attends</legend>
        <div className="ra-checks">
          <Check name="studentsAttend" label="Students attend" defaultChecked={h?.studentsAttend} />
          <Check name="teachersAttend" label="Teachers attend" defaultChecked={h?.teachersAttend} />
        </div>
      </fieldset>
      <FormErrors.Provider value={state?.errors}>
        <fieldset className="ra-fieldset"><legend>Applies to</legend>
          <Check name="allClasses" label="All classes" defaultChecked={h?.allClasses ?? true} />
          {classes.length > 0 && <Checks name="classIds" legend="Or only these classes" options={classes} checked={chosen} />}
        </fieldset>
      </FormErrors.Provider>
      <SaveBar pending={pending} state={state} label={h ? 'Save changes' : 'Add holiday'} />
    </form>
  );
}

export function DeleteHoliday({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button aria-label={`Delete ${title}`} disabled={pending}
      onClick={() => { if (confirm(`Delete ${title}?`)) start(() => deleteHolidayAction(id)); }}><Icon name="trash" /></button>
  );
}
