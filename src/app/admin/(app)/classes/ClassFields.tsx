import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { SelectField, TextField } from '@/components/Fields';
import { listYearGroups } from '@/server/people/year-groups';

type C = { academicYearId: number; name: string; yearGroupId: number | null; mainTeacherId: number | null; capacity: number | null; startsOn: string | null; endsOn: string | null; sortOrder: number };

/** Add/Edit Class fields (§5): name, age group, main teacher, capacity, year start and end. */
export async function ClassFields({ c, yearId, yearStart, yearEnd }: { c?: C; yearId: number; yearStart: string; yearEnd: string }) {
  const [groups, teachers] = await Promise.all([listYearGroups(db), db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name))]);
  return (
    <>
      <input type="hidden" name="academicYearId" value={c?.academicYearId ?? yearId} />
      <div className="ra-fields">
        <TextField name="name" label="Class name" defaultValue={c?.name} autoComplete="off" required />
        <SelectField name="yearGroupId" label="Age group" defaultValue={c?.yearGroupId ? String(c.yearGroupId) : ''} options={[{ value: '', label: 'None' }, ...groups.map((g) => ({ value: String(g.id), label: `${g.label} (${g.minAge}–${g.maxAge})` }))]} />
        <SelectField name="mainTeacherId" label="Main teacher" defaultValue={c?.mainTeacherId ? String(c.mainTeacherId) : ''} options={[{ value: '', label: 'Not assigned' }, ...teachers.map((t) => ({ value: String(t.id), label: t.name }))]} />
        <TextField name="capacity" label="Capacity" type="number" inputMode="numeric" min={0} defaultValue={c?.capacity ?? ''} help="Places in the class. Over-capacity is flagged." />
        <TextField name="startsOn" label="Starts" type="date" defaultValue={c?.startsOn ?? yearStart} />
        <TextField name="endsOn" label="Ends" type="date" defaultValue={c?.endsOn ?? yearEnd} />
        <TextField name="sortOrder" label="Custom order" type="number" inputMode="numeric" defaultValue={c?.sortOrder ?? 0} />
      </div>
    </>
  );
}
