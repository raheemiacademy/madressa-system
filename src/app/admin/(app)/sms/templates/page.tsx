import { db } from '@/db';
import { TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { listSmsTemplates } from '@/server/comm/sms';
import Link from 'next/link';
import { deleteSmsTemplateAction, saveSmsTemplateAction } from '../actions';

export const metadata = { title: 'Message templates' };
const VARS = '{SCHOOL_NAME}, {NAME}, {STUDENT_NAME}, {DATE}, {AMOUNT}, {CODE}';

export default async function SmsTemplates() {
  await requireAdmin('sms');
  const rows = await listSmsTemplates(db);
  const cats = [...new Set(rows.map((r) => r.category))];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Message templates</h1><p>Ready-made WhatsApp messages by category. System templates are the school’s standard wording (for example after an incident); you can reword them but not delete them.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/whatsapp">WhatsApp</Link></div></div>
      {cats.map((c) => (
        <section key={c} className="ra-card" aria-labelledby={`cat-${c}`}>
          <div className="ra-card-h"><div><h2 id={`cat-${c}`}>{c}</h2></div></div>
          {rows.filter((r) => r.category === c).map((t) => (
            <details key={t.id}>
              <summary><b>{t.name}</b>{t.systemKey ? <span className="ra-muted"> · system</span> : null} <span className="ra-muted">{t.body.slice(0, 80)}{t.body.length > 80 ? '…' : ''}</span></summary>
              <Form action={saveSmsTemplateAction.bind(null, t.id)} card={false} savebar={false} submit="Save template">
                <div className="ra-fields">
                  <TextField name="name" id={`n-${t.id}`} label="Name" defaultValue={t.name} />
                  <TextField name="category" id={`c-${t.id}`} label="Category" defaultValue={t.category} disabled={!!t.systemKey} help={t.systemKey ? 'System templates keep their category.' : undefined} />
                  {t.systemKey && <input type="hidden" name="category" value={t.category} />}
                </div>
                <TextArea name="body" id={`b-${t.id}`} label="Text" rows={3} defaultValue={t.body} help={`Variables: ${VARS}`} />
              </Form>
              {!t.systemKey && <ActionButton action={deleteSmsTemplateAction.bind(null, t.id)} label="Delete template" danger confirm={`Delete “${t.name}”?`} />}
            </details>
          ))}
        </section>
      ))}
      <Form action={saveSmsTemplateAction.bind(null, null)} submit="Add template" resetOnSuccess>
        <div className="ra-card-h"><div><h2>New template</h2></div></div>
        <div className="ra-fields">
          <TextField name="name" label="Name" />
          <TextField name="category" label="Category" defaultValue="Custom" help="e.g. Attendance, System, or a new one" />
        </div>
        <TextArea name="body" label="Text" rows={3} help={`Variables: ${VARS}`} />
      </Form>
    </div>
  );
}
