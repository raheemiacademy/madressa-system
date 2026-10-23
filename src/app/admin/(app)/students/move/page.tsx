import Link from 'next/link';
import { db } from '@/db';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { getClass } from '@/server/people/classes';
import { todayIso } from '@/server/people/common';
import { moveClassesAction } from '../actions';
import { yearAndClasses } from '../year-classes';

export const metadata = { title: 'Move student classes' };

export default async function MoveClasses({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requireAdmin('edit');
  const { year, options } = await yearAndClasses();
  const fromId = Number((await searchParams).from) || null;
  const from = fromId ? await getClass(db, fromId) : null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Move student classes</h1><p>Move students from one class to another on a date. Their class history keeps both.</p></div></div>
      <form className="ra-card ra-toolbar" action="/admin/students/move">
        <div className="ra-field" style={{ minWidth: 240 }}><label htmlFor="from">Move students out of</label>
          <select className="ra-select" id="from" name="from" defaultValue={fromId ?? ''}><option value="">Choose a class</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Show students</button>
      </form>
      {!year && <p className="ra-empty">Add an academic year and classes first.</p>}
      {from && (
        <Form action={moveClassesAction} submit="Move students">
          <input type="hidden" name="fromClassId" value={from.id} />
          <div className="ra-card-h"><div><h2>Students in {from.name}</h2><div className="ra-note">Tick who should move.</div></div></div>
          <Checks name="ids" legend="Students" options={from.students.map((s) => ({ value: String(s.id), label: `${s.firstName} ${s.surname}` }))} />
          <div className="ra-fields">
            <SelectField name="toClassId" label="Move to" options={[{ value: '', label: 'Choose a class' }, ...options.filter((o) => o.value !== String(from.id))]} />
            <TextField name="date" label="From date" type="date" defaultValue={todayIso()} help="They leave the old class the day before." />
          </div>
        </Form>
      )}
      <p className="ra-note"><Link href="/admin/students">Back to students</Link></p>
    </div>
  );
}
