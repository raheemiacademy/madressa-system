import { db } from '@/db';
import { INCIDENT_SEVERITIES } from '@/db/schema';
import { Check, SelectField, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listIncidentTemplates } from '@/server/learning/incidents';
import { deleteTemplateAction, saveTemplateAction } from '../actions';

export const metadata = { title: 'Incident templates' };
type T = Awaited<ReturnType<typeof listIncidentTemplates>>[number];

function Fields({ t }: { t?: T }) {
  const k = t?.id ?? 'new';
  return (
    <>
      <div className="ra-fields">
        <TextField name="name" id={`n-${k}`} label="Template name" defaultValue={t?.name ?? ''} />
        <SelectField name="severity" id={`s-${k}`} label="Severity" defaultValue={t?.severity ?? 'Low'} options={INCIDENT_SEVERITIES.map((s) => ({ value: s, label: s }))} />
        <TextField name="title" id={`t-${k}`} label="Title" full defaultValue={t?.title ?? ''} />
      </div>
      <TextArea name="report" id={`r-${k}`} label="Report" rows={3} defaultValue={t?.report ?? ''} />
      <TextArea name="action" id={`a-${k}`} label="Action taken" rows={2} defaultValue={t?.action ?? ''} />
      <div className="ra-checks"><Check name="inEoty" label="Include in the end-of-term report" defaultChecked={t?.inEoty} /><Check name="onPortal" label="Show on the parent portal" defaultChecked={t?.onPortal} /></div>
    </>
  );
}

export default async function Templates() {
  const admin = await requireAdmin('edit');
  const rows = await listIncidentTemplates(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Incident templates</h1><p>Ready-made severity, title, report and action for common incidents</p></div></div>
      {rows.length === 0 ? <p className="ra-empty">No templates yet.</p> : rows.map((t) => (
        <details key={t.id} className="ra-card"><summary><b>{t.name}</b> <span className="ra-muted">{t.severity}</span></summary>
          <Form action={saveTemplateAction.bind(null, t.id)} card={false} savebar={false} submit="Save template"><Fields t={t} /></Form>
          {adminCan(admin.staff, 'delete') && <ActionButton action={deleteTemplateAction.bind(null, t.id)} label="Delete template" danger confirm={`Delete “${t.name}”?`} />}
        </details>
      ))}
      <Form action={saveTemplateAction.bind(null, null)} submit="Add template" resetOnSuccess><div className="ra-card-h"><div><h2>New template</h2></div></div><Fields /></Form>
    </div>
  );
}
