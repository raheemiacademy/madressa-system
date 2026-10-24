import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { classStudentsOn } from '@/server/attendance/registers';
import { listMerits } from '@/server/learning/merits';
import { requireTeacher } from '@/server/next/portal';
import { classesWith } from '@/server/portal/access';
import { todayIso } from '@/server/people/common';
import { meritAction } from '../actions';

export const metadata = { title: 'Merits' };

/** §18/§20 Award merits (or sanctions) to students in classes with the Merits privilege. */
export default async function Merits({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const t = await requireTeacher('Merits');
  const classes = classesWith(t.ctx, 'canMerits');
  const raw = Number((await searchParams).class);
  const cls = classes.find((c) => c.id === raw) ?? classes[0];
  const [merits, kids] = await Promise.all([listMerits(db), cls ? classStudentsOn(db, cls.id, todayIso()) : []]);
  const usable = merits.filter((m) => m.enabled && m.forStudents);
  return (
    <>
      <PortalHead title="Merits" back="/teacher/more" kicker={cls?.name} />
      <main className="rp-main">
        {!cls ? <p className="rp-empty">You don’t have the Merits privilege for any class.</p> : (
          <>
            {classes.length > 1 && <nav className="ra-filters" aria-label="Class">{classes.map((c) => <Link key={c.id} className="ra-filter tap" href={`/teacher/merits?class=${c.id}`} aria-current={c.id === cls.id ? 'page' : undefined}>{c.name}</Link>)}</nav>}
            {!usable.length ? <p className="rp-empty">No merits are set up yet. The office adds them.</p> : !kids.length ? <p className="rp-empty">No students in this class.</p> : (
              <Form action={meritAction} submit="Award" savebar={false}>
                <div className="ra-fields">
                  <SelectField name="meritId" label="Merit" full options={usable.map((m) => ({ value: String(m.id), label: `${m.name} (${m.points > 0 ? '+' : ''}${m.points})` }))} />
                  <TextField name="comment" label="Comment (optional)" full autoComplete="off" />
                </div>
                <fieldset className="ra-fieldset"><legend>Students</legend><div className="ra-checks">
                  {kids.map((k) => <label key={k.id} className="ra-check"><input type="checkbox" name="studentIds" value={k.id} /> {k.firstName} {k.surname}</label>)}
                </div></fieldset>
              </Form>
            )}
          </>
        )}
      </main>
    </>
  );
}
