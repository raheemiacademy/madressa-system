import { db } from '@/db';
import { TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { listYearGroups } from '@/server/people/year-groups';
import { deleteYearGroupAction, saveYearGroupAction } from '../people-actions';

export const metadata = { title: 'Year & age groups' };

export default async function YearGroups() {
  await requireAdmin('super');
  const groups = await listYearGroups(db);
  const fields = (g?: { id: number; label: string; minAge: number; maxAge: number; sortOrder: number }) => {
    const p = g ? `g${g.id}` : 'new';
    return (
      <div className="ra-fields">
        <TextField id={`${p}l`} name="label" label="Label" defaultValue={g?.label} placeholder="e.g. Juniors" />
        <TextField id={`${p}min`} name="minAge" label="Minimum age" type="number" inputMode="numeric" defaultValue={g?.minAge ?? ''} />
        <TextField id={`${p}max`} name="maxAge" label="Maximum age" type="number" inputMode="numeric" defaultValue={g?.maxAge ?? ''} />
        <TextField id={`${p}o`} name="sortOrder" label="Order" type="number" inputMode="numeric" defaultValue={g?.sortOrder ?? 0} />
      </div>
    );
  };
  return (
    <>
      <section className="ra-card" aria-labelledby="yg-h">
        <div className="ra-card-h"><div><h2 id="yg-h">Year &amp; age groups</h2><div className="ra-note">Students are grouped by age on lists and counts; classes are assigned to a group.</div></div></div>
        {groups.length === 0 ? <p className="ra-empty">No groups yet.</p> : groups.map((g) => (
          <details key={g.id} className="ra-card" style={{ padding: 12, background: 'var(--ra-tint)' }}>
            <summary style={{ cursor: 'pointer' }}><b>{g.label}</b> <span className="ra-note">ages {g.minAge} to {g.maxAge}</span></summary>
            <Form action={saveYearGroupAction.bind(null, g.id)} card={false} savebar={false}>{fields(g)}</Form>
            <ActionButton className="ra-link" action={deleteYearGroupAction.bind(null, g.id)} label="Delete group" confirm={`Delete ${g.label}? Classes in it keep their students.`} danger />
          </details>
        ))}
      </section>
      <Form action={saveYearGroupAction.bind(null, undefined)} submit="Add group" resetOnSuccess><div className="ra-card-h"><div><h2>Add a group</h2></div></div>{fields()}</Form>
    </>
  );
}
