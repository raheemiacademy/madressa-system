import Link from 'next/link';
import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { drillHistory, rollCall, runningDrill } from '@/server/attendance/drill';
import { readTab } from '@/server/settings';
import { yearAndClasses } from '../students/year-classes';
import { endDrillAction, safeAction } from './actions';
import { DrillStart } from './DrillStart';

export const metadata = { title: 'Fire drill' };

type Report = { classes: { classId: number; name: string; students: { id: number; name: string }[]; onRoll: number; safe: boolean; registerTaken: boolean }[]; staff: { name: string }[] };

export default async function FireDrill({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  await requireAdmin();
  const [drill, history, settings, { year }] = await Promise.all([runningDrill(db), drillHistory(db), readTab(db, 'fire'), yearAndClasses()]);
  const reportId = Number((await searchParams).report);
  const viewing = history.find((h) => h.id === reportId && h.report);
  if (drill && year) {
    const call = await rollCall(db, year.id);
    const total = call.classes.reduce((n, c) => n + c.students.length, 0);
    const safe = call.classes.filter((c) => settings.processWithoutConfirmation || drill.safeClassIds.includes(c.classId)).reduce((n, c) => n + c.students.length, 0);
    return (
      <div className="ra-page">
        <div className="ra-banner ra-alert" role="status"><div><b>Drill running</b> · started {formatInstant(drill.startedAt, 'HH:mm')} by {drill.startedByName}. {settings.processWithoutConfirmation ? 'Classes are taken from today’s registers.' : 'Confirm each class is all safe.'}</div></div>
        <div className="ra-page-h"><div><h1>{safe} of {total} safe</h1><p>On site from today’s registers. Classes whose register isn’t taken list every student.</p></div>
          <div className="ra-toolbar no-print"><ActionButton className="ra-btn primary" action={endDrillAction} label="End drill and save report" confirm="End the drill and save the report?" /></div></div>
        <div className="ra-class-grid">
          {call.classes.map((c) => {
            const isSafe = !!settings.processWithoutConfirmation || drill.safeClassIds.includes(c.classId);
            return (
              <article key={c.classId} className="ra-class" style={{ ['--c' as string]: isSafe ? 'var(--color-ok)' : 'var(--ra-violet)' }}>
                <div className="ra-class-h"><h3><i />{c.name}</h3>
                  {settings.processWithoutConfirmation ? <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-ok)' }}><span>Processed</span></span>
                    : <ActionButton className={`ra-btn${isSafe ? '' : ' primary'}`} action={safeAction.bind(null, c.classId, !isSafe)} label={isSafe ? 'All safe ✓' : 'Mark all safe'} />}</div>
                <div className="ra-class-row"><span>{c.registerTaken ? 'On site' : 'Register not taken'}</span><span>{c.students.length} of {c.onRoll}</span></div>
                <div className="ra-class-row"><span>Teacher</span><span>{c.teacher ?? 'Not assigned'}</span></div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{c.students.map((s) => <li key={s.id}>{s.name}{s.hasMedical ? ' (medical)' : ''}</li>)}</ul>
              </article>
            );
          })}
        </div>
        {call.classes.length === 0 && <p className="ra-empty">No classes with students today.</p>}
        <section className="ra-card"><div className="ra-card-h"><div><h2>Staff signed in</h2><div className="ra-note">{plural(call.staff.length, 'teacher')} signed in and not yet out</div></div></div>
          {call.staff.length === 0 ? <p className="ra-empty">No teachers signed in today.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{call.staff.map((s) => <li key={s.name}>{s.name} (in {s.timeIn?.slice(0, 5)})</li>)}</ul>}
        </section>
      </div>
    );
  }
  const r = viewing?.report as Report | undefined;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Fire drill</h1><p>Get an instant list of who is on site, for every class.</p></div><div className="ra-toolbar"><Link className="ra-btn" href="/admin/settings/fire">Fire drill settings</Link></div></div>
      <section className="ra-card" style={{ alignItems: 'center', textAlign: 'center' }} aria-labelledby="start-h">
        <h2 id="start-h" style={{ margin: 0 }}>Start a fire drill</h2>
        <DrillStart />
        <p className="ra-note" id="drill-hint">Press and hold for 2 seconds. Let go to cancel. Space or Enter works too.</p>
      </section>
      {r && viewing && (
        <section className="ra-card" aria-labelledby="rep-h">
          <div className="ra-card-h"><div><h2 id="rep-h">Report: {formatInstant(viewing.startedAt, 'dd/MM/yyyy HH:mm')}</h2><div className="ra-note">Started by {viewing.startedByName}{viewing.endedAt ? `, ended ${formatInstant(viewing.endedAt, 'HH:mm')}` : ''}</div></div></div>
          <table className="ra-table"><thead><tr><th>Class</th><th className="num">On site</th><th>All safe</th></tr></thead>
            <tbody>{r.classes.map((c) => <tr key={c.classId}><td className="wrap">{c.name}</td><td className="num">{c.students.length} of {c.onRoll}</td><td>{c.safe ? 'Yes' : <span className="ra-warn">Not confirmed</span>}</td></tr>)}</tbody></table>
        </section>
      )}
      <section className="ra-card" aria-labelledby="hist-h">
        <div className="ra-card-h"><div><h2 id="hist-h">History</h2></div></div>
        {history.length === 0 ? <p className="ra-empty">No drills yet.</p> : (
          <table className="ra-table"><thead><tr><th>Date</th><th>Initiated by</th><th><span className="sr-only">Report</span></th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.id}><td>{formatInstant(h.startedAt, 'dd/MM/yyyy HH:mm')}</td><td className="wrap">{h.startedByName}</td><td>{h.report ? <Link className="ra-link" href={`?report=${h.id}`}>View report</Link> : ''}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
