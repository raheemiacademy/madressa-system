import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { schoolClass } from '@/db/schema';
import { Check, SelectField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { listYears } from '@/server/academic-years';
import { requireAdmin } from '@/server/next/actor';
import { copyClassesAction, copyFeesAction, migrateStudentsAction } from '../../people-actions';

export const metadata = { title: 'New year wizard' };

export default async function Wizard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdmin('super');
  const sp = await searchParams;
  const years = await listYears(db);
  const to = years.find((y) => y.id === Number(sp.to)) ?? years[0];
  const from = years.find((y) => y.id === Number(sp.from)) ?? years.find((y) => to && y.startsOn < to.startsOn);
  const [oldClasses, newClasses] = await Promise.all([
    from ? db.select().from(schoolClass).where(eq(schoolClass.academicYearId, from.id)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)) : [],
    to ? db.select().from(schoolClass).where(eq(schoolClass.academicYearId, to.id)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)) : []
  ]);
  const yearOpts = years.map((y) => ({ value: String(y.id), label: y.title }));
  return (
    <>
      <section className="ra-card" aria-labelledby="w-h">
        <div className="ra-card-h"><div><h2 id="w-h">New year wizard</h2><div className="ra-note">Step 1: add the new year on <Link href="/admin/settings/years">Academic years</Link>. Then copy classes and move students here.</div></div></div>
        <form className="ra-toolbar" action="/admin/settings/years/wizard">
          <div className="ra-field"><label htmlFor="wf">From</label><select className="ra-select" id="wf" name="from" defaultValue={from?.id}>{yearOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div className="ra-field"><label htmlFor="wt">To</label><select className="ra-select" id="wt" name="to" defaultValue={to?.id}>{yearOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <button className="ra-btn" style={{ alignSelf: 'end' }}>Choose</button>
        </form>
      </section>
      {(!from || !to || from.id === to.id) ? <p className="ra-empty">Add the new academic year first, then choose last year and the new year.</p> : (
        <>
          <Form action={copyClassesAction} submit="Copy classes">
            <div className="ra-card-h"><div><h2>Step 2: migrate classes and timings</h2><div className="ra-note">Copies {from.title}’s {oldClasses.length} classes into {to.title}. Classes that already exist there are skipped.</div></div></div>
            <input type="hidden" name="fromYearId" value={from.id} /><input type="hidden" name="toYearId" value={to.id} />
            <div className="ra-checks"><Check name="timings" label="Copy timetables" defaultChecked /><Check name="teachers" label="Copy class teachers and privileges" defaultChecked /></div>
          </Form>
          <Form action={migrateStudentsAction} submit="Move students">
            <div className="ra-card-h"><div><h2>Step 3: migrate students</h2><div className="ra-note">Current students leave each {from.title} class on {from.endsOn} and join the class you choose on {to.startsOn}.</div></div></div>
            <input type="hidden" name="fromYearId" value={from.id} /><input type="hidden" name="toYearId" value={to.id} />
            {oldClasses.length === 0 ? <p className="ra-empty">{from.title} has no classes.</p> : (
              <div className="ra-fields">
                {oldClasses.map((c) => (
                  <SelectField key={c.id} id={`map${c.id}`} name={`map.${c.id}`} label={`From ${c.name}`} defaultValue={String(newClasses.find((n) => n.name.toLowerCase() === c.name.toLowerCase())?.id ?? 'skip')}
                    options={[{ value: 'skip', label: 'Leave as they are' }, { value: 'none', label: 'No class (end it only)' }, ...newClasses.map((n) => ({ value: String(n.id), label: `To ${n.name}` }))]} />
                ))}
              </div>
            )}
          </Form>
          <Form action={copyFeesAction} submit="Copy fees structures">
            <div className="ra-card-h"><div><h2>Step 4: default yearly fees</h2><div className="ra-note">Copies {from.title}’s fees structures into {to.title}, with their periods moved on by a year and linked to classes of the same name. Copy classes first.</div></div></div>
            <input type="hidden" name="fromYearId" value={from.id} /><input type="hidden" name="toYearId" value={to.id} />
          </Form>
        </>
      )}
    </>
  );
}

