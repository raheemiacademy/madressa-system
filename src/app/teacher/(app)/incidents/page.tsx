import { db } from '@/db';
import { INCIDENT_SEVERITIES } from '@/db/schema';
import { PortalHead } from '@/app/_portal/Head';
import { SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { toUkLocal } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { classesWith, studentsInClasses } from '@/server/portal/access';
import { incidentAction } from '../actions';

export const metadata = { title: 'Incidents' };

/** §9/§20 Record an incident for a student in a class with the Incidents privilege. The office decides what's shared with parents. */
export default async function Incidents() {
  const t = await requireTeacher('Incidents');
  const classes = classesWith(t.ctx, 'canIncidents');
  const kids = await studentsInClasses(db, classes.map((c) => c.id));
  return (
    <>
      <PortalHead title="Record an incident" back="/teacher/more" />
      <main className="rp-main">
        {!kids.length ? <p className="rp-empty">You don’t have the Incidents privilege for a class with students.</p> : (
          <Form action={incidentAction} submit="Record incident" savebar={false} resetOnSuccess>
            <div className="ra-fields">
              <SelectField name="studentId" label="Student" full options={[{ value: '', label: 'Choose…' }, ...kids.map((k) => ({ value: String(k.id), label: `${k.firstName} ${k.surname} · ${classes.find((c) => c.id === k.classId)?.name ?? ''}` }))]} />
              <SelectField name="severity" label="Severity" options={INCIDENT_SEVERITIES.map((s) => ({ value: s, label: s }))} />
              <TextField name="occurredAt" label="When" type="datetime-local" defaultValue={toUkLocal(new Date())} />
              <TextField name="title" label="Title" full autoComplete="off" />
              <TextArea name="report" label="What happened" rows={4} />
              <TextArea name="action" label="Action taken (optional)" rows={2} />
            </div>
            <p className="ra-note">The office sees it on their Incidents page and decides whether to tell parents.</p>
          </Form>
        )}
      </main>
    </>
  );
}
