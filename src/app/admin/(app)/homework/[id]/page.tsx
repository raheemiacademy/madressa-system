import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { getHomework } from '@/server/learning/homework';
import { completedAction } from '../actions';

export const metadata = { title: 'Homework' };

export default async function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const h = Number.isInteger(id) ? await getHomework(db, id) : null;
  if (!h) notFound();
  const done = h.students.filter((s) => s.s.completedAt).length;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{h.h.title}</h1><p>{h.className}{h.teacherName ? ` · ${h.teacherName}` : ''} · due {formatInstant(h.h.deadlineAt, 'EEE d MMM yyyy, HH:mm')}{h.h.locked ? ' · locked' : ''}{!h.h.active ? ' · inactive' : ''}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/homework">All homework</Link></div></div>
      <section className="ra-card" aria-labelledby="hi-h">
        <div className="ra-card-h"><div><h2 id="hi-h">Instructions</h2><div className="ra-note">{h.h.lockAfterDeadline ? 'Locks after the deadline. ' : ''}{h.h.allowUploads ? 'Families can upload their work from the parent portal.' : 'No uploads.'}</div></div></div>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{h.h.instructions || <span className="ra-muted">No instructions.</span>}</p>
        {h.h.fileId && <a className="ra-link" href={`/admin/files/${h.h.fileId}`}>Download the homework file</a>}
      </section>
      <section className="ra-card" aria-labelledby="hc-h">
        <div className="ra-card-h"><div><h2 id="hc-h">Completed</h2><div className="ra-note">{done} of {h.students.length} students</div></div></div>
        <Form action={completedAction.bind(null, h.h.id)} card={false} savebar={false} submit="Save">
          <ul className="ra-list" style={{ listStyle: 'none', padding: 0 }}>{h.students.map((s) => (
            <li key={s.s.studentId}>
              <label className="ra-check"><input type="checkbox" name="done" value={s.s.studentId} defaultChecked={!!s.s.completedAt} disabled={!adminCan(admin.staff, 'edit')} /><span>{s.firstName} {s.surname}{s.s.completedAt ? <span className="ra-muted"> · done {formatInstant(s.s.completedAt, 'dd/MM')}</span> : null}</span></label>
              {s.s.uploadFileId && <> <a className="ra-link" href={`/admin/files/${s.s.uploadFileId}`}>{s.file ?? 'Uploaded work'}</a></>}
            </li>
          ))}</ul>
        </Form>
      </section>
    </div>
  );
}
