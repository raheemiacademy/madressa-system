import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { getTemplate, render, TEMPLATES, versionsOf } from '@/server/comm/templates';
import { resetTemplateAction, saveTemplateAction } from '../../comm-actions';

export const metadata = { title: 'Edit template' };

export default async function EditTemplate({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ version?: string }> }) {
  await requireAdmin('super');
  const key = decodeURIComponent((await params).key);
  if (!TEMPLATES[key]) notFound();
  const version = ((await searchParams).version ?? 'Standard').slice(0, 40);
  const [t, versions] = await Promise.all([getTemplate(db, key, version), versionsOf(db, key)]);
  // Sample values so the preview reads naturally; the real ones are filled in when it's sent.
  const sample = Object.fromEntries(t.vars.map((v) => [v, v.endsWith('_HTML') ? '<ul><li>Sample row</li></ul>' : `[${v.toLowerCase().replace(/_/g, ' ')}]`]));
  const preview = await render(db, key, sample, version);
  return (
    <>
      <section className="ra-card" aria-labelledby="te-h">
        <div className="ra-card-h"><div><h2 id="te-h">{t.name}</h2><div className="ra-note">{t.group}{t.pdf ? ' · PDF' : ' · email'} · version {t.version}{t.edited ? ' (edited)' : ' (built-in text)'}</div></div>
          <Link className="ra-link" href="/admin/settings/templates">All templates</Link></div>
        <nav className="ra-filters" aria-label="Versions">{versions.map((v) => <Link key={v} className="ra-filter" aria-current={v.toLowerCase() === t.version.toLowerCase() ? 'page' : undefined} href={`?version=${encodeURIComponent(v)}`}>{v}</Link>)}</nav>
        <Form action={saveTemplateAction.bind(null, key)} card={false} submit="Save template">
          <TextField name="version" label="Version name" defaultValue={t.version} help="Change the name to save this as a new version (e.g. Urgent). Standard is used unless a version is chosen." />
          <TextField name="subject" label="Subject" defaultValue={t.subject} full />
          <TextArea name="body" label="Body (HTML)" rows={12} defaultValue={t.body} spellCheck={false} help={`Variables: ${t.vars.map((v) => `{${v}}`).join(', ')}. Scripts and unsafe attributes are removed when you save.`} />
        </Form>
        {t.edited && <ActionButton action={resetTemplateAction.bind(null, key, t.version)} label={t.version.toLowerCase() === 'standard' ? 'Reset to built-in text' : `Delete version ${t.version}`} danger confirm="Are you sure?" />}
      </section>
      <section className="ra-card" aria-labelledby="tpv-h">
        <div className="ra-card-h"><div><h2 id="tpv-h">Preview</h2><div className="ra-note">Subject: {preview.subject}</div></div></div>
        <iframe className="ra-preview" title="Template preview" srcDoc={preview.html} sandbox="" />
      </section>
    </>
  );
}
