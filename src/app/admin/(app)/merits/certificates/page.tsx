import { db } from '@/db';
import { BADGES } from '@/db/schema';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { DEFAULT_LAYOUT, listCertificates, listCertificateTemplates } from '@/server/learning/merits';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';
import { issueAction, saveTemplateAction } from '../actions';
import { MeritTabs } from '../MeritTabs';
import { PeoplePicker } from '../PeoplePicker';
import { rostersFor } from '../rosters';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Certificates' };
type T = Awaited<ReturnType<typeof listCertificateTemplates>>[number];
const ITEMS = [['name', 'Name'], ['achievement', 'Achievement'], ['badge', 'Badge'], ['address', 'Address'], ['date', 'Date']] as const;

/** Where each item is printed, in mm from the bottom-left of an A4 landscape page (other sizes scale). */
function TemplateFields({ t }: { t?: T }) {
  const k = t?.id ?? 'new';
  const L = t?.layout ?? DEFAULT_LAYOUT;
  return (
    <>
      <div className="ra-fields">
        <TextField name="name" id={`tn-${k}`} label="Template name" defaultValue={t?.name ?? ''} />
        <SelectField name="size" id={`ts-${k}`} label="Size" defaultValue={t?.size ?? 'A4'} options={['A4', 'A5', 'A6'].map((s) => ({ value: s, label: s }))} />
        <SelectField name="orientation" id={`to-${k}`} label="Orientation" defaultValue={t?.orientation ?? 'landscape'} options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} />
        <FileDrop name="file" id={`tf-${k}`} label={`Background PDF${t?.fileId ? ' (uploaded; choose a file to replace it)' : ''}`} accept="application/pdf,.pdf" />
      </div>
      <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
        <thead><tr><th>Item</th><th>Across (mm)</th><th>Up (mm)</th><th>Size (pt)</th></tr></thead>
        <tbody>{ITEMS.map(([key, label]) => (
          <tr key={key}><td>{label}</td>
            {(['x', 'y', 'size'] as const).map((f) => <td key={f}><input className="ra-input" name={`${key}.${f}`} inputMode="decimal" defaultValue={String(L[key][f])} aria-label={`${label}: ${f === 'x' ? 'across' : f === 'y' ? 'up' : 'size'}`} style={{ width: 80 }} /></td>)}</tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

/** §18 Certificates: issue to students, download each as a PDF, and set up templates. */
export default async function Certificates() {
  await requireAdmin('edit');
  const { options } = await yearAndClasses();
  const [templates, issued, rosters] = await Promise.all([listCertificateTemplates(db), listCertificates(db), rostersFor(options)]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Certificates</h1><p>Issue certificates and print them on your own design</p></div></div>
      <MeritTabs current="/admin/merits/certificates" />
      <Form action={issueAction} submit="Issue certificates" resetOnSuccess>
        <div className="ra-card-h"><div><h2>Issue a certificate</h2></div></div>
        <div className="ra-fields">
          <SelectField name="templateId" label="Template" options={[{ value: '', label: 'Plain certificate' }, ...templates.map((t) => ({ value: String(t.id), label: t.name }))]} />
          <SelectField name="badge" label="Badge" options={BADGES.map((b) => ({ value: b, label: b[0]!.toUpperCase() + b.slice(1) }))} />
          <TextField name="forText" label="For" full help="e.g. Excellent attendance this term" />
          <TextField name="issuedOn" label="Date" type="date" defaultValue={todayIso()} />
        </div>
        <Check name="onPortal" label="Show on the parent portal" defaultChecked />
        {options.length > 0 && <PeoplePicker name="studentIds" classes={options} rosters={rosters} />}
      </Form>
      <section className="ra-card" aria-labelledby="ci-h">
        <div className="ra-card-h"><div><h2 id="ci-h">Issued</h2></div></div>
        {issued.length === 0 ? <p className="ra-empty">No certificates issued yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 520 }}><table className="ra-table">
            <thead><tr><th>Date</th><th>Student</th><th>For</th><th>Badge</th><th>Template</th><th><span className="sr-only">PDF</span></th></tr></thead>
            <tbody>{issued.map((c) => (
              <tr key={c.c.id}><td>{formatCalendarDate(c.c.issuedOn)}</td><td className="wrap">{c.firstName} {c.surname}</td><td className="wrap">{c.c.forText}</td><td>{c.c.badge === 'none' ? '' : c.c.badge}</td><td>{c.templateName ?? 'Plain'}</td>
                <td><a className="ra-link" href={`/admin/merits/certificates/${c.c.id}/pdf`}>PDF</a></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {templates.map((t) => (
        <details key={t.id} className="ra-card"><summary><b>Template: {t.name}</b> <span className="ra-muted">{t.size} {t.orientation}{t.fileId ? ' · with background' : ''}</span></summary>
          <Form action={saveTemplateAction.bind(null, t.id)} card={false} savebar={false} submit="Save template" encType="multipart/form-data"><TemplateFields t={t} /></Form>
        </details>
      ))}
      <Form action={saveTemplateAction.bind(null, null)} submit="Add template" encType="multipart/form-data">
        <div className="ra-card-h"><div><h2>New certificate template</h2><div className="ra-note">Upload your certificate design as a PDF, then say where the name, achievement, badge, address and date go.</div></div></div>
        <TemplateFields />
      </Form>
    </div>
  );
}
