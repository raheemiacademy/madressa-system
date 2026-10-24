import { db } from '@/db';
import { TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listHomeworkTemplates } from '@/server/learning/homework';
import { deleteTemplateAction, saveTemplateAction } from '../actions';

export const metadata = { title: 'Homework templates' };

export default async function Templates() {
  const admin = await requireAdmin('edit');
  const rows = await listHomeworkTemplates(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Homework templates</h1><p>Ready-made titles and instructions to start homework from</p></div></div>
      {rows.length === 0 ? <p className="ra-empty">No templates yet.</p> : rows.map((t) => (
        <details key={t.id} className="ra-card">
          <summary><b>{t.title}</b></summary>
          <Form action={saveTemplateAction.bind(null, t.id)} card={false} savebar={false} submit="Save template">
            <TextField name="title" id={`t-${t.id}`} label="Title" defaultValue={t.title} full />
            <TextArea name="instructions" id={`i-${t.id}`} label="Instructions" rows={4} defaultValue={t.instructions} />
          </Form>
          {adminCan(admin.staff, 'delete') && <ActionButton action={deleteTemplateAction.bind(null, t.id)} label="Delete template" danger confirm={`Delete “${t.title}”?`} />}
        </details>
      ))}
      <Form action={saveTemplateAction.bind(null, null)} submit="Add template" resetOnSuccess>
        <div className="ra-card-h"><div><h2>New template</h2></div></div>
        <TextField name="title" label="Title" full />
        <TextArea name="instructions" label="Instructions" rows={4} />
      </Form>
    </div>
  );
}
