'use client';

import { useState } from 'react';
import { Checks, SelectField, TextArea } from '@/components/Fields';
import { Form } from '@/components/Form';
import { ContactPicker } from '../messages/ContactPicker';
import { sendSmsAction } from './actions';
import { FileDrop } from '@/components/FileDrop';

/** Texts are 160 characters, or 153 each when a message is split. */
const parts = (n: number) => (n <= 160 ? 1 : Math.ceil(n / 153));

export function SmsForm({ groups, classes, templates }: { groups: [string, string][]; classes: { value: string; label: string }[]; templates: { id: number; label: string; body: string }[] }) {
  const [group, setGroup] = useState('currentPrimary');
  const [body, setBody] = useState('');
  return (
    <Form action={sendSmsAction} submit="Queue texts" encType="multipart/form-data">
      <div className="ra-fields">
        <SelectField name="group" label="Send to" value={group} onChange={(e) => setGroup(e.target.value)} options={[...groups.map(([value, label]) => ({ value, label })), { value: 'none', label: 'Only the numbers below' }]} />
        <SelectField name="template" label="Start from a template" defaultValue="" onChange={(e) => { const t = templates.find((x) => String(x.id) === e.target.value); if (t) setBody(t.body); }}
          options={[{ value: '', label: 'No template' }, ...templates.map((t) => ({ value: String(t.id), label: t.label }))]} />
      </div>
      {group === 'classes' && <Checks name="classIds" legend="Classes" options={classes} />}
      {group === 'chosen' && <ContactPicker />}
      <TextArea name="body" label="Message" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={918}
        help={`${body.length} characters · ${parts(body.length) === 1 ? '1 text' : `${parts(body.length)} texts`} each. {NAME} becomes each person’s name and {SCHOOL_NAME} the school’s.`} />
      <details>
        <summary className="ra-link" style={{ display: 'inline-grid' }}>Add numbers from a CSV</summary>
        <div className="ra-fields">
          <FileDrop name="csv" label="CSV file" id="sms-csv" accept=".csv,text/csv" />
          <TextArea name="paste" label="Or paste: one number per line, optionally followed by a comma and a name" rows={4} spellCheck={false} />
        </div>
      </details>
    </Form>
  );
}
