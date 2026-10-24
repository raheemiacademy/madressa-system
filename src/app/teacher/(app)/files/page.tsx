import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject } from '@/db/schema';
import { PortalHead } from '@/app/_portal/Head';
import { formatInstant } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { docsFor } from '@/server/portal/shared';

export const metadata = { title: 'Docs and files' };

/** §20 Documents the office shares with teachers (all teachers, or the teacher's classes). */
export default async function Files() {
  const t = await requireTeacher('Docs & Files');
  const docs = await docsFor(db, 'teachers', t.ctx.classes.map((c) => c.id));
  const files = docs.length ? await db.select().from(fileObject).where(inArray(fileObject.id, docs.map((d) => d.fileId))) : [];
  return (
    <>
      <PortalHead title="Docs and files" back="/teacher/more" />
      <main className="rp-main">
        {!docs.length ? <p className="rp-empty">No documents yet.</p> : (
          <ul className="rp-list">
            {docs.map((d) => { const f = files.find((x) => x.id === d.fileId); return <li key={d.id}><a href={`/teacher/file/${d.fileId}`}><span className="t">{d.title}</span><span className="v">Download</span><span className="m">{f?.filename} · {formatInstant(d.createdAt, 'd MMM yyyy')}</span></a></li>; })}
          </ul>
        )}
      </main>
    </>
  );
}
