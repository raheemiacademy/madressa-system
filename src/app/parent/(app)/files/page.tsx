import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { fileObject } from '@/db/schema';
import { PortalHead } from '@/app/_portal/Head';
import { formatInstant } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { docsFor } from '@/server/portal/shared';

export const metadata = { title: 'Files' };

/** §20 Documents the school shares with parents (all parents, or your children's classes). */
export default async function Files() {
  const p = await requireParent('Files');
  const docs = await docsFor(db, 'parents', p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c));
  const files = docs.length ? await db.select().from(fileObject).where(inArray(fileObject.id, docs.map((d) => d.fileId))) : [];
  return (
    <>
      <PortalHead title="Files" back="/parent/more" />
      <main className="rp-main">
        {!docs.length ? <p className="rp-empty">No documents yet.</p> : (
          <ul className="rp-list">
            {docs.map((d) => { const f = files.find((x) => x.id === d.fileId); return <li key={d.id}><a href={`/parent/file/${d.fileId}`}><span className="t">{d.title}</span><span className="v">Download</span><span className="m">{f?.filename} · {formatInstant(d.createdAt, 'd MMM yyyy')}</span></a></li>; })}
          </ul>
        )}
      </main>
    </>
  );
}
