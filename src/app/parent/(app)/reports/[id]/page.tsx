import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { PrintButton } from '@/components/PrintButton';
import { ReportCard } from '@/components/ReportCard';
import { buildReport } from '@/server/learning/eoty';
import { requireParent } from '@/server/next/portal';
import { portalReports } from '@/server/portal/parent';
import { getProfile } from '@/server/profile';
import { pickKid } from '../../kids';

export const metadata = { title: 'Term report' };

/** One child's report, only when the school has put that report on the portal. */
export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Term Reports');
  const kid = pickKid(p, (await searchParams).child);
  const id = Number((await params).id);
  if (!kid?.classId || !(await portalReports(db, p.ctx.year?.id ?? null)).some((r) => r.id === id)) notFound();
  const [x, profile] = await Promise.all([buildReport(db, id, kid.id, kid.classId), getProfile(db)]);
  if (!x) notFound();
  return (
    <>
      <PortalHead title={x.report.title} back={`/parent/reports?child=${kid.id}`} kicker={kid.label}><span className="no-print"><PrintButton /></span></PortalHead>
      <main className="rp-main"><ReportCard x={x} school={profile?.name} /></main>
    </>
  );
}
