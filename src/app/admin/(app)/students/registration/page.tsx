import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Check, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { deleteApplicationGroup, listApplicationGroups, saveApplicationGroup } from '@/server/people/extras';
import { formWindow, registrationFields } from '@/server/people/registration';
import { readTab } from '@/server/settings';

export const metadata = { title: 'Registration pages' };

async function saveGroup(id: number | undefined, _p: FormState, fd: FormData): Promise<FormState> {
  'use server';
  const a = await requireAdmin('super');
  const r = await saveApplicationGroup(db, actorOf(a), formObject(fd), id);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  revalidatePath('/admin/students/registration');
  return { ok: true, message: 'Saved.' };
}
async function removeGroup(id: number) {
  'use server';
  const a = await requireAdmin('super');
  await deleteApplicationGroup(db, actorOf(a), id);
  revalidatePath('/admin/students/registration');
}

const STATE = { open: 'Open', disabled: 'Turned off', 'not-yet': 'Not open yet', closed: 'Closed' } as const;

export default async function Registration() {
  const admin = await requireAdmin();
  const [settings, groups, fields] = await Promise.all([readTab(db, 'registration'), listApplicationGroups(db), registrationFields(db)]);
  const state = formWindow(settings);
  const base = process.env.APP_URL ?? '';
  const isSuper = adminCan(admin.staff, 'super');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Registration pages</h1><p>Public application forms. Applications arrive as Waiting List students.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/settings/registration">Form settings</Link><Link className="ra-btn" href="/apply">Open the form</Link></div></div>
      <div className="ra-grid">
        <section className="ra-card ra-c6" aria-labelledby="st-h">
          <div className="ra-card-h"><div><h2 id="st-h">Status</h2></div><Chip colour={state === 'open' ? 'var(--color-ok)' : 'var(--color-fg-muted)'}>{STATE[state]}</Chip></div>
          <dl className="ra-dl">
            <dt>Child form</dt><dd><Link href="/apply">{base}/apply</Link></dd>
            <dt>Adult form</dt><dd>{settings.adultEnabled ? <Link href="/apply/adult">{base}/apply/adult</Link> : 'Turned off'}</dd>
            <dt>Custom fields</dt><dd>{fields.length ? fields.map((f) => f.label).join(', ') : <>None. <Link href="/admin/settings/custom-fields">Add custom fields</Link> and tick “show on registration”.</>}</dd>
          </dl>
        </section>
        <section className="ra-card ra-c6" aria-labelledby="em-h">
          <div className="ra-card-h"><div><h2 id="em-h">Embed on your website</h2><div className="ra-note">Paste this into any page of your own site.</div></div></div>
          <pre style={{ margin: 0, padding: 12, borderRadius: 10, background: 'var(--ra-tint)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13 }}>{`<iframe src="${base}/apply" title="Application form" style="width:100%;min-height:1200px;border:0"></iframe>`}</pre>
        </section>
      </div>
      <section className="ra-card" aria-labelledby="g-h">
        <div className="ra-card-h"><div><h2 id="g-h">Application groups</h2><div className="ra-note">What parents can apply for, for example “Boys &amp; Girls Maktab (4+)”.</div></div></div>
        {groups.length === 0 ? <p className="ra-empty">No groups yet.</p> : groups.map((g) => (
          <details key={g.id} className="ra-card" style={{ padding: 12, background: 'var(--ra-tint)' }}>
            <summary style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ overflowWrap: 'anywhere' }}>{g.name}</b>{!g.enabled && <Chip colour="var(--color-fg-muted)">Off</Chip>}{g.required && <Chip>Required</Chip>}{g.multipleChoice && <Chip>Multiple choice</Chip>}
            </summary>
            {isSuper && (
              <>
                <Form action={saveGroup.bind(null, g.id)} card={false} savebar={false}>
                  <GroupFields g={g} />
                </Form>
                <ActionButton className="ra-link" action={removeGroup.bind(null, g.id)} label="Delete group" confirm={`Delete ${g.name}? Students keep their records.`} danger />
              </>
            )}
          </details>
        ))}
      </section>
      {isSuper && <Form action={saveGroup.bind(null, undefined)} submit="Add group" resetOnSuccess><div className="ra-card-h"><div><h2>Add an application group</h2></div></div><GroupFields /></Form>}
    </div>
  );
}

function GroupFields({ g }: { g?: { id: number; name: string; sortOrder: number; enabled: boolean; required: boolean; multipleChoice: boolean; description: string | null } }) {
  const p = g ? `g${g.id}-` : 'new-';
  return (
    <>
      <div className="ra-fields">
        <TextField id={`${p}name`} name="name" label="Name" defaultValue={g?.name} />
        <TextField id={`${p}order`} name="sortOrder" label="Order" type="number" inputMode="numeric" defaultValue={g?.sortOrder ?? 0} />
        <TextArea id={`${p}desc`} name="description" label="Description for parents" defaultValue={g?.description ?? ''} rows={2} />
      </div>
      <div className="ra-checks">
        <Check name="enabled" label="Enabled" defaultChecked={g?.enabled ?? true} />
        <Check name="required" label="Parents must choose this" defaultChecked={g?.required} />
        <Check name="multipleChoice" label="Can be chosen alongside other groups" defaultChecked={g?.multipleChoice ?? true} />
      </div>
    </>
  );
}
