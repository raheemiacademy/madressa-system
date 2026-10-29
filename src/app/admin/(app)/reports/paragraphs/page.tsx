import Link from 'next/link';
import { db } from '@/db';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { AREAS, PARAGRAPH_VARS, paragraphs } from '@/server/learning/eoty';
import { paragraphsAction, restoreDefaultsAction } from '../actions';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Paragraph templates' };
const LEVELS = ['1 (lowest)', '2', '3', '4', '5 (highest)'];

/** §16 Paragraph templates: Behaviour, Progress and Effort, five levels each, in any language. Backup and restore as a file. */
export default async function Paragraphs() {
  const admin = await requireAdmin();
  const p = await paragraphs(db);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Paragraph templates</h1><p>The sentence a report shows for each score. Variables: {PARAGRAPH_VARS.join(', ')}. Without a recorded gender, the first name is used instead of he/she.</p></div>
        <div className="ra-toolbar">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download (route handler), not a page */}
          <a className="ra-btn" href="/admin/reports/paragraphs/backup">Download backup</a>{canEdit && <ActionButton action={restoreDefaultsAction} label="Restore defaults" confirm="Replace all paragraphs with the built-in text?" />}<Link className="ra-btn" href="/admin/reports">Reports</Link></div></div>
      <Form action={paragraphsAction} submit="Save paragraphs">
        {AREAS.map((a) => (
          <fieldset key={a} className="ra-fieldset">
            <legend>{a[0]!.toUpperCase() + a.slice(1)}</legend>
            {p[a].map((text, i) => (
              <div key={i} className="ra-field"><label htmlFor={`${a}-${i}`}>Level {LEVELS[i]}</label>
                <textarea className="ra-textarea" id={`${a}-${i}`} name={`${a}.${i + 1}`} rows={2} defaultValue={text} disabled={!canEdit} /></div>
            ))}
          </fieldset>
        ))}
      </Form>
      {canEdit && (
        <Form action={paragraphsAction} submit="Restore backup" encType="multipart/form-data">
          <div className="ra-card-h"><div><h2>Restore a backup</h2><div className="ra-note">Choose a file made with “Download backup”. It replaces all 15 paragraphs.</div></div></div>
          <FileDrop name="backup" label="Backup file" id="pb-file" accept=".json,application/json" />
        </Form>
      )}
    </div>
  );
}
