import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { portalReports } from '@/server/portal/parent';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Term reports' };

/** §16/§20 End-of-term reports the school has put on the portal. */
export default async function Reports({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Term Reports');
  const kid = pickKid(p, (await searchParams).child);
  const reports = kid?.classId ? await portalReports(db, p.ctx.year?.id ?? null) : [];
  return (
    <>
      <PortalHead title="Term reports" back="/parent/more" kicker={kid?.label} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/reports" />
            {!reports.length ? <p className="rp-empty">No reports yet. They appear here when the school publishes them.</p> : (
              <ul className="rp-list">
                {reports.map((r) => <li key={r.id}><Link href={`/parent/reports/${r.id}?child=${kid.id}`}><span className="t">{r.title}</span><span className="v" aria-hidden="true">›</span><span className="m">{formatCalendarDate(r.termStart)} to {formatCalendarDate(r.termEnd)}</span></Link></li>)}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
