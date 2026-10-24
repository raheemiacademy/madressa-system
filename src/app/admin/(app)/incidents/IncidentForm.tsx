'use client';

import { useState } from 'react';
import { Check, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { saveIncidentAction } from './actions';

type Opt = { value: string; label: string };
type Tpl = { id: number; name: string; severity: string; title: string; report: string; action: string; inEoty: boolean; onPortal: boolean };
export type IncidentValues = { kind: string; classId: string; studentId: string; teacherId: string; staffId: string; severity: string; occurredAt: string; title: string; report: string; action: string; inEoty: boolean; onPortal: boolean };

/** §9 Add incident: who (a class then a student, or a teacher, or staff), an optional template, and what happened. */
export function IncidentForm({ id, v, classes, rosters, teachers, staff, severities, templates }: {
  id: number | null; v: IncidentValues; classes: Opt[]; rosters: Record<string, Opt[]>; teachers: Opt[]; staff: Opt[]; severities: readonly string[]; templates: Tpl[];
}) {
  const [kind, setKind] = useState(v.kind);
  const [classId, setClassId] = useState(v.classId || classes[0]?.value || '');
  const [f, setF] = useState({ severity: v.severity, title: v.title, report: v.report, action: v.action, inEoty: v.inEoty, onPortal: v.onPortal });
  const [tplKey, setTplKey] = useState(0);
  return (
    <Form action={saveIncidentAction.bind(null, id)} submit={id ? 'Save incident' : 'Record incident'}>
      <div className="ra-fields">
        <SelectField name="kind" label="Involves" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'student', label: 'A student' }, { value: 'teacher', label: 'A teacher' }, { value: 'staff', label: 'Admin staff' }]} />
        {kind === 'student' && <>
          <SelectField name="classId" label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classes} />
          <SelectField name="studentId" label="Student" defaultValue={v.studentId} options={[{ value: '', label: 'Choose a student' }, ...(rosters[classId] ?? [])]} />
        </>}
        {kind === 'teacher' && <SelectField name="teacherId" label="Teacher" defaultValue={v.teacherId} options={[{ value: '', label: 'Choose a teacher' }, ...teachers]} />}
        {kind === 'staff' && <SelectField name="staffId" label="Staff member" defaultValue={v.staffId} options={[{ value: '', label: 'Choose a staff member' }, ...staff]} />}
        {templates.length > 0 && <SelectField name="template" label="Template" defaultValue="" onChange={(e) => {
          const t = templates.find((x) => String(x.id) === e.target.value);
          if (t) { setF({ severity: t.severity, title: t.title, report: t.report, action: t.action, inEoty: t.inEoty, onPortal: t.onPortal }); setTplKey((k) => k + 1); }
        }} options={[{ value: '', label: 'No template' }, ...templates.map((t) => ({ value: String(t.id), label: t.name }))]} />}
        <SelectField name="severity" label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} options={severities.map((s) => ({ value: s, label: s }))} />
        <TextField name="occurredAt" label="Date and time" type="datetime-local" defaultValue={v.occurredAt} />
        <TextField name="title" label="Title" full value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <TextArea name="report" label="Report" rows={5} value={f.report} onChange={(e) => setF({ ...f, report: e.target.value })} />
      <TextArea name="action" label="Action taken" rows={3} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} />
      <div className="ra-checks" key={tplKey}>
        <Check name="inEoty" label="Include in the end-of-term report" defaultChecked={f.inEoty} />
        <Check name="onPortal" label="Show on the parent portal" defaultChecked={f.onPortal} />
        {kind === 'student' && <Check name="emailContacts" label="Email the primary contacts" />}
      </div>
    </Form>
  );
}
