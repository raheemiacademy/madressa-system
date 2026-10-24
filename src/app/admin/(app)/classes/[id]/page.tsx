import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { academicYear, student, teacher } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { Check, Checks, SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { annualTotal, listStructures, periodsOf, structureByClass } from '@/server/fees/structures';
import { classStructureAction } from '../../fees/actions';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { getClass, listRooms, listSubjects, PRIVILEGES } from '@/server/people/classes';
import { todayIso } from '@/server/people/common';
import { addStudentsAction, classTeacherAction, deleteClassAction, removeClassTeacherAction, removeStudentAction, saveClassAction } from '../actions';
import { ClassFields } from '../ClassFields';
import { SlotForm, SlotList } from '../SlotParts';

export const metadata = { title: 'Class' };

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getClass(db, id) : null;
  if (!c) notFound();
  const memberIds = c.students.map((s) => s.id);
  const [[year], teachers, candidates, rooms, subjects] = await Promise.all([
    db.select().from(academicYear).where(eq(academicYear.id, c.academicYearId)),
    db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student)
      .where(and(sql`${student.status} in ('Current', 'Accepted', 'Waiting List')`, memberIds.length ? notInArray(student.id, memberIds) : undefined)).orderBy(asc(student.surname), asc(student.firstName)),
    listRooms(db), listSubjects(db)
  ]);
  const canEdit = adminCan(admin.staff, 'edit');
  const canFees = adminCan(admin.staff, 'fees');
  const [fees, structures] = canFees ? await Promise.all([structureByClass(db, c.academicYearId).then((m) => m.get(id)), listStructures(db, c.academicYearId)]) : [undefined, []];
  const perYear = fees?.structure ? annualTotal(await periodsOf(db, [fees.structure.id])) : null;
  const cap = c.capacity ?? 0;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{c.name}</h1><p>{year?.title} · {cap ? `${c.students.length} of ${cap} places` : plural(c.students.length, 'student')}{cap && c.students.length > cap ? <span className="ra-warn"> · {c.students.length - cap} over capacity</span> : null}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/classes/print?class=${id}&mode=full`}>Class summary</Link><Link className="ra-btn" href={`/admin/students/move?from=${id}`}>Move students</Link></div></div>
      <div className="ra-grid">
        <div className="ra-c6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {canEdit ? (
            <Form action={saveClassAction.bind(null, id)}>
              <div className="ra-card-h"><div><h2>Class details</h2></div></div>
              <ClassFields c={c} yearId={c.academicYearId} yearStart={year?.startsOn ?? ''} yearEnd={year?.endsOn ?? ''} />
            </Form>
          ) : <section className="ra-card"><h2 style={{ margin: 0, fontSize: 16 }}>Class details</h2></section>}

          <section className="ra-card" aria-labelledby="ct-h">
            <div className="ra-card-h"><div><h2 id="ct-h">Class teachers</h2><div className="ra-note">What each teacher can do for this class in the teacher portal.</div></div></div>
            {c.teachers.length === 0 ? <p className="ra-empty">No teachers yet.</p> : c.teachers.map(({ ct, name }) => (
              <details key={ct.teacherId} className="ra-card" style={{ padding: 12, background: 'var(--ra-tint)' }}>
                <summary style={{ cursor: 'pointer' }}><b>{name}</b> <span className="ra-note">{PRIVILEGES.filter(([k]) => ct[k]).map(([, l]) => l).join(', ') || 'No privileges'}</span></summary>
                {canEdit && (
                  <>
                    <Form action={classTeacherAction.bind(null, id)} card={false} savebar={false} submit="Save privileges">
                      <input type="hidden" name="teacherId" value={ct.teacherId} />
                      <div className="ra-checks">{PRIVILEGES.map(([k, l]) => <Check key={k} name={k} label={l} defaultChecked={ct[k]} />)}</div>
                    </Form>
                    <ActionButton className="ra-link" action={removeClassTeacherAction.bind(null, id, ct.teacherId)} label="Remove from class" confirm={`Remove ${name} from ${c.name}?`} danger />
                  </>
                )}
              </details>
            ))}
            {canEdit && (
              <Form action={classTeacherAction.bind(null, id)} card={false} savebar={false} submit="Add teacher" resetOnSuccess>
                <SelectField id="add-teacher" name="teacherId" label="Add a teacher" options={[{ value: '', label: 'Choose a teacher' }, ...teachers.filter((t) => !c.teachers.some((x) => x.ct.teacherId === t.id)).map((t) => ({ value: String(t.id), label: t.name }))]} />
                <div className="ra-checks">{PRIVILEGES.map(([k, l]) => <Check key={k} name={k} label={l} defaultChecked={k === 'canRegister'} />)}</div>
              </Form>
            )}
          </section>
        </div>

        <div className="ra-c6" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="ra-card" aria-labelledby="cs-h">
            <div className="ra-card-h"><div><h2 id="cs-h">Students</h2><div className="ra-note">{plural(c.students.length, 'student')} in this class now</div></div></div>
            {c.students.length === 0 ? <p className="ra-empty">No students in this class yet.</p> : (
              <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 420 }}><table className="ra-table">
                <thead><tr><th>Student</th><th className="opt">Since</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{c.students.map((s) => (
                  <tr key={s.id}><td className="wrap"><Link href={`/admin/students/${s.id}`}>{s.firstName} {s.surname}</Link></td><td className="opt">{formatCalendarDate(s.from)}</td><td><Chip>{s.status}</Chip></td>
                    <td>{canEdit && <span className="ra-acts"><ActionButton className="" ariaLabel={`Remove ${s.firstName} ${s.surname} from the class`} action={removeStudentAction.bind(null, id, s.id)} confirm={`Remove ${s.firstName} ${s.surname} from ${c.name} today?`}><Icon name="trash" /></ActionButton></span>}</td></tr>
                ))}</tbody>
              </table></div>
            )}
            {canEdit && candidates.length > 0 && (
              <details><summary className="ra-link" style={{ display: 'inline-grid' }}>Add students</summary>
                <Form action={addStudentsAction.bind(null, id)} card={false} savebar={false} submit="Add to class">
                  <TextField name="from" label="From date" type="date" defaultValue={todayIso()} />
                  <Checks name="studentIds" legend="Students who aren’t in this class" options={candidates.map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName} (${s.status})` }))} />
                </Form>
              </details>
            )}
          </section>

          {canFees && (
            <section className="ra-card" aria-labelledby="fee-h">
              <div className="ra-card-h"><div><h2 id="fee-h">Fees</h2><div className="ra-note">{fees?.structure ? `${fees.structure.name}${fees.own ? '' : ' (default)'}: ${formatPence(perYear ?? 0)} per student per year` : 'No fees structure applies: this class isn’t billed.'}</div></div>
                <Link className="ra-link" href="/admin/fees/structure">Fees structure</Link></div>
              <Form action={classStructureAction.bind(null, id)} card={false} savebar={false} submit="Save fees">
                <SelectField name="structureId" label="This class uses" defaultValue={fees?.own && fees.structure ? String(fees.structure.id) : ''}
                  options={[{ value: '', label: 'The default structure' }, ...structures.filter((s) => !s.isDefault && !s.isAdHoc).map((s) => ({ value: String(s.id), label: `Its own fees: ${s.name}` }))]} />
              </Form>
            </section>
          )}

          <section className="ra-card" aria-labelledby="tt-h">
            <div className="ra-card-h"><div><h2 id="tt-h">Timetable</h2><div className="ra-note">Sessions each week. Sessions that take a register appear in Registers.</div></div><Link className="ra-link" href="/admin/classes/timetable#copy">Apply a template</Link></div>
            <SlotList slots={c.slots} canEdit={canEdit} />
            {canEdit && <SlotForm owner={{ classId: id }} teachers={teachers} rooms={rooms} subjects={subjects} />}
          </section>
        </div>
      </div>
      {adminCan(admin.staff, 'delete') && (
        <section className="ra-card"><div className="ra-card-h"><div><h2>Delete class</h2><div className="ra-note">Only classes that have never had students can be deleted.</div></div>
          <ActionButton action={deleteClassAction.bind(null, id)} label="Delete class" confirm={`Delete ${c.name}?`} danger /></div></section>
      )}
    </div>
  );
}
