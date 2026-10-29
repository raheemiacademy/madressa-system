import { db } from '@/db';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { newsletterFiles } from '@/server/comm/newsletters';
import { deleteFileAction, uploadFileAction } from '../actions';
import { CommTabs } from '../CommTabs';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Image manager' };

export default async function Files() {
  const admin = await requireAdmin('marketing');
  const files = await newsletterFiles(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Image manager</h1><p>Images and files for newsletters. They’re public, because they appear in emails, so don’t upload anything private.</p></div></div>
      <CommTabs admin={admin} current="/admin/newsletters/files" />
      <Form action={uploadFileAction} submit="Upload" encType="multipart/form-data" resetOnSuccess>
        <FileDrop name="file" label="Image or file" id="nf-file" />
      </Form>
      <section className="ra-card" aria-label="Files">
        {files.length === 0 ? <p className="ra-empty">No images or files yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>File</th><th>Type</th><th>Uploaded</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{files.map((f) => (
              <tr key={f.id}><td className="wrap"><a href={`/files/${f.id}`} target="_blank" rel="noreferrer">{f.filename}</a></td><td>{f.purpose === 'newsletter-image' ? 'Image' : 'File'}</td>
                <td>{formatInstant(f.createdAt, 'dd/MM/yyyy')}</td><td><ActionButton action={deleteFileAction.bind(null, f.id)} label="Delete" danger confirm={`Delete ${f.filename}? Newsletters already sent will lose it.`} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
