import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { eotyReport } from '@/db/schema';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { classesWith } from '@/server/portal/access';

export const metadata = { title: 'Report comments' };

/** §16/§20 Active end-of-term reports, for each class where the teacher has the EOTY privilege. */
export default async function Reports() {
  const t = await requireTeacher('EOTY Reports');
  const classes = classesWith(t.ctx, 'canEoty');
  const reports = t.ctx.year ? await db.select().from(eotyReport).where(and(eq(eotyReport.academicYearId, t.ctx.year.id), eq(eotyReport.active, true))).orderBy(desc(eotyReport.termEnd)) : [];
  return (
    <>
      <PortalHead title="Report comments" back="/teacher/more" />
      <main className="rp-main">
        {!classes.length ? <p className="rp-empty">You don’t have the report comments privilege for any class.</p>
          : !reports.length ? <p className="rp-empty">No reports are open for comments right now.</p> : reports.map((r) => (
            <section key={r.id} aria-labelledby={`r-${r.id}`} style={{ display: 'grid', gap: 8 }}>
              <h2 id={`r-${r.id}`}>{r.title} <span className="ra-muted" style={{ fontWeight: 400, fontSize: 13 }}>{formatCalendarDate(r.termStart)} to {formatCalendarDate(r.termEnd)}</span></h2>
              <ul className="rp-list">{classes.map((c) => <li key={c.id}><Link className="tap" href={`/teacher/reports/${r.id}?class=${c.id}`}><span className="t">{c.name}</span><span className="v" aria-hidden="true">›</span></Link></li>)}</ul>
            </section>
          ))}
      </main>
    </>
  );
}
