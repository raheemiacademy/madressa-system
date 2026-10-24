import { db } from '@/db';
import { BADGES } from '@/db/schema';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { listAchievements, listCertificateTemplates, listMerits, reached } from '@/server/learning/merits';
import { todayIso } from '@/server/people/common';
import { issueAction, saveAchievementAction } from '../actions';
import { MeritTabs } from '../MeritTabs';

export const metadata = { title: 'Achievements' };
type A = Awaited<ReturnType<typeof listAchievements>>[number];

/** §18 Achievements and sanctions: milestones by collecting a merit (or total points), each with a badge and a certificate template. */
export default async function Achievements() {
  await requireAdmin('edit');
  const [rows, merits, templates] = await Promise.all([listAchievements(db), listMerits(db), listCertificateTemplates(db)]);
  const reachedBy = await Promise.all(rows.map(async (r) => ({ id: r.a.id, students: await reached(db, r.a.id) })));
  const meritOpts = [{ value: '', label: 'Total points from any merit' }, ...merits.map((m) => ({ value: String(m.id), label: `This many “${m.name}” merits` }))];
  const tplOpts = [{ value: '', label: 'Plain certificate' }, ...templates.map((t) => ({ value: String(t.id), label: t.name }))];
  const fields = (a?: A) => {
    const k = a?.a.id ?? 'new';
    return (
      <>
        <div className="ra-fields">
          <TextField name="name" id={`an-${k}`} label="Name" defaultValue={a?.a.name ?? ''} />
          <SelectField name="meritId" id={`am-${k}`} label="Reached by" defaultValue={String(a?.a.meritId ?? '')} options={meritOpts} />
          <TextField name="target" id={`at-${k}`} label="Target" inputMode="numeric" defaultValue={String(a?.a.target ?? 10)} />
          <SelectField name="badge" id={`ab-${k}`} label="Badge" defaultValue={a?.a.badge ?? 'none'} options={BADGES.map((b) => ({ value: b, label: b[0]!.toUpperCase() + b.slice(1) }))} />
          <SelectField name="certificateTemplateId" id={`ac-${k}`} label="Certificate template" defaultValue={String(a?.a.certificateTemplateId ?? '')} options={tplOpts} />
        </div>
        <div className="ra-checks">
          <Check name="sanction" label="This is a sanction" defaultChecked={a?.a.sanction} />
          <Check name="forStudents" label="For students" defaultChecked={a?.a.forStudents ?? true} />
          <Check name="forTeachers" label="For teachers" defaultChecked={a?.a.forTeachers} />
          <Check name="enabled" label="Enabled" defaultChecked={a?.a.enabled ?? true} />
        </div>
      </>
    );
  };
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Achievements &amp; sanctions</h1><p>Milestones students reach by collecting merits or points</p></div></div>
      <MeritTabs current="/admin/merits/achievements" />
      {rows.length === 0 ? <p className="ra-empty">No achievements yet.</p> : rows.map((a) => {
        const hit = reachedBy.find((x) => x.id === a.a.id)!.students;
        return (
          <details key={a.a.id} className="ra-card">
            <summary><b>{a.a.name}</b> <span className="ra-muted">{a.a.target} {a.meritName ? `× ${a.meritName}` : 'points'} · {a.a.badge}</span>{hit.length > 0 && <span className="ra-warn"> · {hit.length === 1 ? '1 student has' : `${hit.length} students have`} reached it</span>}</summary>
            <Form action={saveAchievementAction.bind(null, a.a.id)} card={false} savebar={false} submit="Save">{fields(a)}</Form>
            {hit.length > 0 && (
              <Form action={issueAction} card={false} savebar={false} submit="Issue certificates">
                <h3 style={{ fontSize: 14, margin: 0 }}>Reached, no certificate yet</h3>
                <div className="ra-checks">{hit.map((s) => <label key={s.id} className="ra-check"><input type="checkbox" name="studentIds" value={s.id} defaultChecked /><span>{s.firstName} {s.surname}</span></label>)}</div>
                <input type="hidden" name="achievementId" value={a.a.id} /><input type="hidden" name="templateId" value={a.a.certificateTemplateId ?? ''} /><input type="hidden" name="badge" value={a.a.badge} />
                <input type="hidden" name="forText" value={a.a.name} /><input type="hidden" name="issuedOn" value={todayIso()} /><input type="hidden" name="onPortal" value="on" />
              </Form>
            )}
          </details>
        );
      })}
      <Form action={saveAchievementAction.bind(null, null)} submit="Add" resetOnSuccess><div className="ra-card-h"><div><h2>New achievement or sanction</h2></div></div>{fields()}</Form>
    </div>
  );
}
