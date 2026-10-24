import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { eotyReport } from '@/db/schema';
import { PrintButton } from '@/components/PrintButton';
import { ReportCard } from '@/components/ReportCard';
import { requireAdmin } from '@/server/next/actor';
import { buildReport, termStudents } from '@/server/learning/eoty';
import { getProfile } from '@/server/profile';
import { yearAndClasses } from '../../../students/year-classes';

export const metadata = { title: 'Generate reports' };

/** §16 Generate Reports: one page per student (print, or Download PDF). */
export default async function Generate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string; student?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [r] = Number.isInteger(id) ? await db.select().from(eotyReport).where(eq(eotyReport.id, id)) : [];
  if (!r) notFound();
  const { options } = await yearAndClasses();
  const classId = Number(sp.class) || 0;
  const kids = classId ? (await termStudents(db, r, classId)).filter((k) => !sp.student || k.id === Number(sp.student)) : [];
  const [profile, reports] = await Promise.all([getProfile(db), Promise.all(kids.map((k) => buildReport(db, id, k.id, classId)))]);
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>{r.title}: generate reports</h1><p>Choose a class to see each student’s report, then print or download them as a PDF</p></div>
        <div className="ra-toolbar">{kids.length > 0 && <PrintButton />}<Link className="ra-btn" href={`/admin/reports/${id}`}>Report settings</Link></div></div>
      <form className="ra-card ra-toolbar no-print" role="search">
        <div className="ra-field"><label htmlFor="gr-class">Class</label><select className="ra-select" id="gr-class" name="class" defaultValue={String(classId || '')}><option value="">Choose a class</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <button className="ra-btn">Show reports</button>
      </form>
      {classId && kids.length === 0 ? <p className="ra-empty">No students were in this class during the term.</p> : null}
      {reports.map((x) => x && <ReportCard key={x.student.id} x={x} school={profile?.name} />)}
    </div>
  );
}
