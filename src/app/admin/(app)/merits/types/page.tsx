import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Check, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { listMerits } from '@/server/learning/merits';
import { saveMeritAction } from '../actions';
import { MeritTabs } from '../MeritTabs';

export const metadata = { title: 'Merit types' };
type M = Awaited<ReturnType<typeof listMerits>>[number];

function Fields({ m }: { m?: M }) {
  const k = m?.id ?? 'new';
  return (
    <>
      <div className="ra-fields">
        <TextField name="name" id={`mn-${k}`} label="Name" defaultValue={m?.name ?? ''} />
        <TextField name="points" id={`mp-${k}`} label="Points" inputMode="numeric" defaultValue={String(m?.points ?? 1)} help="Use a minus number for a sanction, e.g. −2." />
        <TextField name="description" id={`md-${k}`} label="Description" full defaultValue={m?.description ?? ''} />
      </div>
      <div className="ra-checks">
        <Check name="forStudents" label="For students" defaultChecked={m?.forStudents ?? true} />
        <Check name="forTeachers" label="For teachers" defaultChecked={m?.forTeachers ?? false} />
        <Check name="enabled" label="Enabled" defaultChecked={m?.enabled ?? true} />
        <Check name="official" label="Official" defaultChecked={m?.official ?? false} />
      </div>
    </>
  );
}

export default async function Types() {
  await requireAdmin('edit');
  const rows = await listMerits(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Merits</h1><p>The merits (and sanctions) staff can award, and their points</p></div></div>
      <MeritTabs current="/admin/merits/types" />
      {rows.length === 0 ? <p className="ra-empty">No merits yet.</p> : rows.map((m) => (
        <details key={m.id} className="ra-card"><summary><b>{m.name}</b> <span className="ra-muted">{m.points > 0 ? `+${m.points}` : m.points} points · {[m.forStudents && 'students', m.forTeachers && 'teachers'].filter(Boolean).join(' and ')}</span> {!m.enabled && <Chip colour="var(--color-fg-muted)">Disabled</Chip>}{m.official && <Chip>Official</Chip>}</summary>
          <Form action={saveMeritAction.bind(null, m.id)} card={false} savebar={false} submit="Save merit"><Fields m={m} /></Form>
        </details>
      ))}
      <Form action={saveMeritAction.bind(null, null)} submit="Add merit" resetOnSuccess><div className="ra-card-h"><div><h2>New merit</h2></div></div><Fields /></Form>
    </div>
  );
}
