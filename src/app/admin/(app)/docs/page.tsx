import { db } from '@/db';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listDocs } from '@/server/portal/docs';
import { yearAndClasses } from '../students/year-classes';
import { addDocAction, deleteDocAction } from './actions';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Shared files' };
const WHO: Record<string, string> = { parents: 'Parents', teachers: 'Teachers', both: 'Parents and teachers' };

/** §20 Files on the parent portal and Docs & Files on the teacher portal: documents the office shares, for everyone or chosen classes. */
export default async function Docs() {
  const admin = await requireAdmin();
  const [docs, { options }] = await Promise.all([listDocs(db), yearAndClasses()]);
  const canDelete = adminCan(admin.staff, 'delete');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Shared files</h1><p>Documents parents see under Files, and teachers under Docs &amp; Files</p></div></div>
      {adminCan(admin.staff, 'edit') && (
        <Form action={addDocAction} submit="Share file" encType="multipart/form-data" resetOnSuccess>
          <div className="ra-fields">
            <TextField name="title" label="Title" />
            <SelectField name="audience" label="Who can see it" options={Object.entries(WHO).map(([value, label]) => ({ value, label }))} />
            <FileDrop name="file" label="File" id="doc-file" />
          </div>
          {options.length > 0 && <Checks name="classIds" legend="Only these classes (leave empty for everyone)" options={options} />}
        </Form>
      )}
      <section className="ra-card" aria-labelledby="docs-h">
        <div className="ra-card-h"><div><h2 id="docs-h">Shared</h2></div></div>
        {!docs.length ? <p className="ra-empty">Nothing shared yet.</p> : (
          <div className="ra-table-wrap">
            <table className="ra-table">
              <thead><tr><th>Title</th><th>Who</th><th className="opt">Classes</th><th className="opt">Added</th><th /></tr></thead>
              <tbody>
                {docs.map(({ d, filename }) => (
                  <tr key={d.id}>
                    <td className="wrap"><a href={`/admin/files/${d.fileId}`}>{d.title}</a><div className="ra-note">{filename}</div></td>
                    <td>{WHO[d.audience]}</td>
                    <td className="opt wrap">{d.classIds.length ? d.classIds.map((c) => options.find((o) => o.value === String(c))?.label ?? 'Old class').join(', ') : 'All'}</td>
                    <td className="opt">{formatInstant(d.createdAt, 'dd/MM/yyyy')} · {d.createdBy}</td>
                    <td>{canDelete && <ActionButton action={deleteDocAction.bind(null, d.id)} label="Delete" danger confirm={`Delete “${d.title}”? Parents and teachers will no longer see it.`} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
