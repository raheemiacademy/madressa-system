import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { newsletter } from '@/db/schema';
import { Checks, SelectField, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { RichText } from '@/components/RichText';
import { requireAdmin } from '@/server/next/actor';
import { AUDIENCES, newsletterFiles, recipients, renderNewsletter, STYLES } from '@/server/comm/newsletters';
import { getProfile } from '@/server/profile';
import { yearAndClasses } from '../../students/year-classes';
import { deleteNewsletterAction, saveNewsletterAction, sendNewsletterAction, sendTestAction } from '../actions';

export const metadata = { title: 'Newsletter' };

export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('marketing');
  const raw = (await params).id;
  const id = raw === 'new' ? null : Number(raw);
  const [n] = id ? await db.select().from(newsletter).where(eq(newsletter.id, id)) : [];
  if (id && !n) notFound();
  const [{ options }, files, profile] = await Promise.all([yearAndClasses(), newsletterFiles(db), getProfile(db)]);
  const count = n ? (await recipients(db, n.audience as keyof typeof AUDIENCES, n.classIds)).length : 0;
  const preview = n ? await renderNewsletter(db, n, { name: 'Sample Parent' }) : null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{n ? n.subject : 'New newsletter'}</h1><p>Choose who it’s for and how it looks, then write it. {'{NAME}'} becomes each person’s name.</p></div>
        {n && (
          <div className="ra-toolbar">
            <ActionButton action={sendTestAction.bind(null, n.id)} label="Send a test to me" />
            <ActionButton className="ra-btn primary" action={sendNewsletterAction.bind(null, n.id)} label={`Send to ${count === 1 ? '1 person' : `${count} people`}`}
              confirm={`Send “${n.subject}” to ${count === 1 ? '1 person' : `${count} people`} now? Save your changes first.`} />
            <ActionButton action={deleteNewsletterAction.bind(null, n.id)} label="Delete" danger confirm="Delete this newsletter?" />
          </div>
        )}</div>
      <Form action={saveNewsletterAction.bind(null, n?.id ?? null)} submit={n ? 'Save newsletter' : 'Create newsletter'}>
        <div className="ra-fields">
          <TextField name="fromName" label="From name" defaultValue={n?.fromName ?? profile?.name ?? ''} />
          <TextField name="fromEmail" label="From email" type="email" defaultValue={n?.fromEmail ?? ''} help="Blank uses the school’s sending address." />
          <TextField name="subject" label="Subject" full defaultValue={n?.subject ?? ''} />
          <SelectField name="audience" label="Send to" defaultValue={n?.audience ?? 'parents'} options={Object.entries(AUDIENCES).map(([value, label]) => ({ value, label }))} />
          <SelectField name="style" label="Template" defaultValue={n?.style ?? 'modern'} options={Object.entries(STYLES).map(([value, label]) => ({ value, label }))} />
        </div>
        <Checks name="classIds" legend="Classes (for “Parents in chosen classes”)" options={options} checked={(n?.classIds ?? []).map(String)} />
        <RichText name="body" label="Newsletter" defaultValue={n?.body ?? ''} />
        <TextArea name="signature" label="Signature" rows={3} defaultValue={n?.signature ?? ''} />
        <Checks name="fileIds" legend="Images and files from the image manager" options={files.map((f) => ({ value: f.id, label: f.filename }))} checked={n?.fileIds ?? []}
          help="Images appear under the text; other files are added as links." />
      </Form>
      {preview && (
        <section className="ra-card" aria-labelledby="pv-h">
          <div className="ra-card-h"><div><h2 id="pv-h">Preview</h2><div className="ra-note">As saved, for a sample parent</div></div></div>
          <iframe className="ra-preview" title="Newsletter preview" srcDoc={preview} sandbox="" />
        </section>
      )}
    </div>
  );
}
