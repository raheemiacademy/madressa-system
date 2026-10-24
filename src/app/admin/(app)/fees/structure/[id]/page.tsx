import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { feeStructure, feeStructureClass } from '@/db/schema';
import { ActionButton } from '@/components/Form';
import { penceToInput } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { periodsOf } from '@/server/fees/structures';
import { yearAndClasses } from '../../../students/year-classes';
import { deleteStructureAction } from '../../actions';
import { FeesHead } from '../../FeesHead';
import { StructureEditor, type PeriodRow } from '../StructureEditor';

export const metadata = { title: 'Edit fees structure' };

export default async function EditStructure({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const admin = await requireAdmin('fees');
  const raw = (await params).id;
  const { year, options } = await yearAndClasses();
  if (!year) notFound();
  const id = raw === 'new' ? null : Number(raw);
  const [s] = id ? await db.select().from(feeStructure).where(and(eq(feeStructure.id, id), eq(feeStructure.academicYearId, year.id))).limit(1) : [];
  if (id && !s) notFound();
  const [periods, classIds] = s ? await Promise.all([periodsOf(db, [s.id]), db.select({ id: feeStructureClass.classId }).from(feeStructureClass).where(eq(feeStructureClass.structureId, s.id))]) : [[], []];
  const rows: PeriodRow[] = periods.map((p) => ({ id: p.id, name: p.name, startsOn: p.startsOn, endsOn: p.endsOn, invoiceCount: String(p.invoiceCount), intervalCount: String(p.intervalCount), intervalUnit: p.intervalUnit, amount: penceToInput(p.amountPence), startWeekday: p.startWeekday === null ? '' : String(p.startWeekday), dueRule: p.dueRule }));
  const kind = s ? (s.isDefault ? 'default' : s.isAdHoc ? 'adhoc' : 'class') : ((await searchParams).kind === 'adhoc' ? 'adhoc' : 'class');
  return (
    <div className="ra-page">
      <FeesHead title={s ? `Edit ${s.name}` : kind === 'adhoc' ? 'New ad hoc structure' : 'New fees structure'} desc={`Fee periods for ${year.title}. Each period issues its invoices at the interval you set.`}>
        {s && adminCan(admin.staff, 'delete') && <ActionButton action={deleteStructureAction.bind(null, s.id)} label="Delete structure" danger confirm={`Delete “${s.name}”? Invoices already generated are kept.`} />}
      </FeesHead>
      <StructureEditor id={s?.id ?? null} name={s?.name ?? ''} kind={kind} classIds={classIds.map((c) => String(c.id))} classes={options} periods={rows} yearStart={year.startsOn} yearEnd={year.endsOn} />
    </div>
  );
}
