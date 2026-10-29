import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject } from '@/db/schema';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { childHomework } from '@/server/portal/parent';
import { removeUploadAction, uploadHomeworkAction } from '../actions';
import { KidSwitch, NoKids, pickKid } from '../kids';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Homework' };
const STATUS: Record<string, string> = { 'Handed in': 'var(--color-ok)', Due: 'var(--ra-blue)', Missed: 'var(--color-bad)' };

/** §13/§20 Homework (design: ParentHomework): what's due with instructions and hand-in uploads, then earlier work. */
export default async function Homework({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Homework');
  const kid = pickKid(p, (await searchParams).child);
  const all = kid ? await childHomework(db, kid) : [];
  const files = await (() => { const ids = all.flatMap((h) => [h.uploadFileId, h.fileId]).filter((x): x is string => !!x); return ids.length ? db.select({ id: fileObject.id, filename: fileObject.filename }).from(fileObject).where(inArray(fileObject.id, ids)) : Promise.resolve([]); })();
  const name = (id: string | null) => files.find((f) => f.id === id)?.filename ?? 'File';
  const current = all.filter((h) => h.status === 'Due' || (h.status === 'Handed in' && h.canUpload));
  const earlier = all.filter((h) => !current.includes(h));
  return (
    <>
      <PortalHead title="Homework" kicker={kid ? `${kid.label}${kid.className ? ` · ${kid.className}` : ''}` : undefined} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/homework" />
            {!current.length && <p className="rp-empty">No homework due. Well done!</p>}
            {current.map((h) => (
              <article key={h.id} className="ra-card" aria-labelledby={`hw-${h.id}`} style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <h2 id={`hw-${h.id}`} style={{ margin: 0, fontSize: 17 }}>{h.title}</h2><Chip colour={STATUS[h.status]}>{h.status}</Chip>
                </div>
                <div className="ra-note">{h.teacherName ? `${h.teacherName} · ` : ''}due {formatInstant(h.deadlineAt, 'EEE d MMM, HH:mm')}</div>
                {h.instructions && <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{h.instructions}</p>}
                {h.fileId && <a href={`/parent/file/${h.fileId}`}>{name(h.fileId)}</a>}
                {h.uploadFileId && (
                  <div className="rp-row" style={{ minHeight: 0 }}>
                    <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-blue)' }} aria-hidden="true">✓</span>
                    <span><b><a href={`/parent/file/${h.uploadFileId}`}>{name(h.uploadFileId)}</a></b><small>Handed in {h.uploadedAt ? formatInstant(h.uploadedAt, 'd MMM, HH:mm') : ''}</small></span>
                    {h.canUpload && <ActionButton action={removeUploadAction.bind(null, kid.id, h.id)} label="Remove" confirm="Remove the handed-in file?" />}
                  </div>
                )}
                {h.canUpload && !h.uploadFileId && (
                  <Form action={uploadHomeworkAction.bind(null, kid.id, h.id)} submit="Hand in" savebar={false} card={false} encType="multipart/form-data">
                    <FileDrop name="file" label="Add a recording, photo or PDF" id={`up-${h.id}`} accept="audio/*,image/*,application/pdf,video/webm,video/mp4" />
                  </Form>
                )}
                {!h.allowUploads && <p className="ra-note" style={{ margin: 0 }}>No upload needed: the teacher will mark it in class.</p>}
              </article>
            ))}
            <h2>Earlier</h2>
            {!earlier.length ? <p className="rp-empty">Nothing earlier this year.</p> : (
              <ul className="rp-list">
                {earlier.map((h) => (
                  <li key={h.id}>
                    <span className="t">{h.title}</span><span className="v"><Chip colour={STATUS[h.status]}>{h.status}</Chip></span>
                    <span className="m">{formatInstant(h.deadlineAt, 'd MMM')}{h.note ? ` · teacher comment: ${h.note}` : ''}{h.uploadFileId ? ' · file handed in' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
