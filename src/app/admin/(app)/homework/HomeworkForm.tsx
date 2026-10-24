'use client';

import { useState } from 'react';
import { Check, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { saveHomeworkAction } from './actions';

type Opt = { value: string; label: string };

/** §13 Add homework. Choosing a class lists its students; tick some to set it for them only. A template fills the title and instructions. */
export function HomeworkForm({ classes, rosters, teachers, templates, defaultDeadline }: {
  classes: Opt[]; rosters: Record<string, Opt[]>; teachers: Opt[]; templates: { id: number; title: string; instructions: string }[]; defaultDeadline: string;
}) {
  const [classId, setClassId] = useState(classes[0]?.value ?? '');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const kids = rosters[classId] ?? [];
  return (
    <Form action={saveHomeworkAction} submit="Set homework" encType="multipart/form-data">
      <div className="ra-fields">
        <SelectField name="classId" label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classes} />
        <SelectField name="teacherId" label="Teacher" options={[{ value: '', label: 'No teacher' }, ...teachers]} />
        {templates.length > 0 && <SelectField name="template" label="Start from a template" defaultValue="" onChange={(e) => { const t = templates.find((x) => String(x.id) === e.target.value); if (t) { setTitle(t.title); setInstructions(t.instructions); } }}
          options={[{ value: '', label: 'No template' }, ...templates.map((t) => ({ value: String(t.id), label: t.title }))]} />}
        <TextField name="title" label="Title" full value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField name="deadline" label="Deadline" type="datetime-local" defaultValue={defaultDeadline} />
      </div>
      <fieldset className="ra-fieldset ra-field full">
        <legend>Students (leave all unticked for the whole class)</legend>
        {kids.length === 0 ? <p className="ra-note" style={{ margin: 0 }}>This class has no students today.</p> : (
          <div className="ra-checks">{kids.map((k) => <label key={k.value} className="ra-check"><input type="checkbox" name="studentIds" value={k.value} /><span>{k.label}</span></label>)}</div>
        )}
      </fieldset>
      <TextArea name="instructions" label="Instructions" rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      <div className="ra-field"><label htmlFor="hw-file">File for students (optional)</label><input className="ra-input" id="hw-file" name="file" type="file" style={{ paddingTop: 8 }} /></div>
      <div className="ra-checks">
        <Check name="lockAfterDeadline" label="Lock after the deadline" />
        <Check name="allowUploads" label="Let families upload their work" />
        <Check name="notifyContacts" label="Email primary contacts now" />
      </div>
    </Form>
  );
}
