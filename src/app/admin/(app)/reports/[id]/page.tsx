import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { eotyReport, semester } from '@/db/schema';
import { Check, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { saveReportAction } from '../actions';

export const metadata = { title: 'EOTY report' };

/** §16 Create or edit a report's settings. */
export default async function ReportSettings({ params }: { params: Promise<{ id: string }> }) {
  const raw = (await params).id;
  await requireAdmin(raw === 'new' ? 'edit' : 'view');
  const id = raw === 'new' ? null : Number(raw);
  const [r] = id ? await db.select().from(eotyReport).where(eq(eotyReport.id, id)) : [];
  if (id && !r) notFound();
  const { year } = await yearAndClasses();
  const sems = year ? await db.select().from(semester).where(eq(semester.academicYearId, year.id)) : [];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{r ? r.title : 'New report'}</h1><p>What the report includes and how teachers score students</p></div>
        {r && <div className="ra-toolbar"><Link className="ra-btn primary" href={`/admin/reports/${r.id}/comments`}>Comments</Link><Link className="ra-btn" href={`/admin/reports/${r.id}/overview`}>Overview</Link>
          <Link className="ra-btn" href={`/admin/reports/${r.id}/all`}>All comments</Link><Link className="ra-btn" href={`/admin/reports/${r.id}/print`}>Generate reports</Link></div>}</div>
      <Form action={saveReportAction.bind(null, r?.id ?? null)} submit={r ? 'Save report' : 'Create report'}>
        <div className="ra-fields">
          <TextField name="title" label="Report name" full defaultValue={r?.title ?? ''} />
          <TextField name="termStart" label="Term starts" type="date" defaultValue={r?.termStart ?? year?.startsOn ?? ''} />
          <TextField name="termEnd" label="Term ends" type="date" defaultValue={r?.termEnd ?? ''} />
          <SelectField name="semesterId" label="Exam results from" defaultValue={String(r?.semesterId ?? '')} options={[{ value: '', label: 'Official exams dated in the term' }, ...sems.map((s) => ({ value: String(s.id), label: `Semester: ${s.title}` }))]} />
        </div>
        <div className="ra-checks">
          <Check name="includeExams" label="Include exam results" defaultChecked={r?.includeExams ?? true} />
          <Check name="includePositions" label="Show class positions" defaultChecked={r?.includePositions ?? false} />
          <Check name="includeAttendance" label="Include attendance" defaultChecked={r?.includeAttendance ?? true} />
          <Check name="includeHomework" label="Include homework" defaultChecked={r?.includeHomework ?? true} />
          <Check name="scoring" label="Score students on questions" defaultChecked={r?.scoring ?? true} />
          <Check name="active" label="Active (teachers can write comments)" defaultChecked={r?.active ?? true} />
          <Check name="teachersCanDownload" label="Teachers can preview and download" defaultChecked={r?.teachersCanDownload ?? false} />
          <Check name="onPortal" label="Parents can see it on the parent portal" defaultChecked={r?.onPortal ?? false} />
        </div>
        <div className="ra-fields">
          <TextArea name="questions" label="Scoring questions, one per line" rows={4} defaultValue={(r?.questions ?? ['Behaviour', 'Progress', 'Effort']).join('\n')}
            help="Questions called Behaviour, Progress or Effort also get the matching paragraph template on the report." />
          <TextArea name="scoreLabels" label="Score labels, lowest first, one per line" rows={5} defaultValue={(r?.scoreLabels ?? ['Needs support', 'Developing', 'Good', 'Very good', 'Excellent']).join('\n')} />
        </div>
      </Form>
    </div>
  );
}
