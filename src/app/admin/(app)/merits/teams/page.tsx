import { db } from '@/db';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { PALETTE_COLOURS } from '@/settings/tabs';
import { requireAdmin } from '@/server/next/actor';
import { listCompetitions, listTeams, standings } from '@/server/learning/merits';
import { yearAndClasses } from '../../students/year-classes';
import { saveCompetitionAction, saveTeamAction } from '../actions';
import { MeritTabs } from '../MeritTabs';

export const metadata = { title: 'Teams' };
type T = Awaited<ReturnType<typeof listTeams>>[number];

/** §18 Merit teams (houses) of classes or students, and team competitions with their standings. */
export default async function Teams() {
  await requireAdmin('edit');
  const { options } = await yearAndClasses();
  const [teams, comps] = await Promise.all([listTeams(db), listCompetitions(db)]);
  const tables = await Promise.all(comps.map((c) => standings(db, c.id)));
  const fields = (t?: T) => (
    <>
      <div className="ra-fields">
        <TextField name="name" id={`tm-${t?.id ?? 'new'}`} label="Team name" defaultValue={t?.name ?? ''} />
        <SelectField name="colour" id={`tc-${t?.id ?? 'new'}`} label="Colour" defaultValue={t?.colour ?? 'lav'} options={PALETTE_COLOURS} />
      </div>
      <Checks name="classIds" legend="Member classes" options={options} checked={(t?.classIds ?? []).map(String)} />
    </>
  );
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Teams</h1><p>Houses made of classes, competing on merit points between two dates</p></div></div>
      <MeritTabs current="/admin/merits/teams" />
      {tables.map((s) => s && (
        <section key={s.competition.id} className="ra-card" aria-labelledby={`cp-${s.competition.id}`}>
          <div className="ra-card-h"><div><h2 id={`cp-${s.competition.id}`}>{s.competition.name}</h2><div className="ra-note">{formatCalendarDate(s.competition.startsOn)} to {formatCalendarDate(s.competition.endsOn)}</div></div></div>
          {s.rows.length === 0 ? <p className="ra-empty">Add teams to see standings.</p> : (
            <ol className="ra-list">{s.rows.map((r) => <li key={r.team.id}><span className="ra-chip" style={{ ['--c' as string]: `var(--ra-${r.team.colour})` }}><span>{r.team.name}</span></span> {r.points === 1 ? '1 point' : `${r.points} points`}</li>)}</ol>
          )}
        </section>
      ))}
      {teams.map((t) => (
        <details key={t.id} className="ra-card"><summary><b>{t.name}</b> <span className="ra-muted">{t.classIds.length === 1 ? '1 class' : `${t.classIds.length} classes`}</span></summary>
          <Form action={saveTeamAction.bind(null, t.id)} card={false} savebar={false} submit="Save team">{fields(t)}</Form>
        </details>
      ))}
      <div className="ra-grid">
        <div className="ra-c6"><Form action={saveTeamAction.bind(null, null)} submit="Add team" resetOnSuccess><div className="ra-card-h"><div><h2>New team</h2></div></div>{fields()}</Form></div>
        <div className="ra-c6"><Form action={saveCompetitionAction.bind(null, null)} submit="Add competition" resetOnSuccess>
          <div className="ra-card-h"><div><h2>New competition</h2></div></div>
          <div className="ra-fields"><TextField name="name" label="Name" /><TextField name="startsOn" label="Starts" type="date" /><TextField name="endsOn" label="Ends" type="date" /></div>
        </Form></div>
      </div>
    </div>
  );
}
