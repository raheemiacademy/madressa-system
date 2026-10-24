import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { ActionButton } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { rollCall, runningDrill } from '@/server/attendance/drill';
import { requireTeacher } from '@/server/next/portal';
import { drillSafeAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fire drill' };

/** §19/§20 During a fire drill: the roll call for the teacher's classes, and "all safe" for each. */
export default async function Drill() {
  const t = await requireTeacher();
  const d = await runningDrill(db);
  const call = d && t.ctx.year ? await rollCall(db, t.ctx.year.id) : null;
  const mine = call?.classes.filter((c) => t.ctx.classes.some((k) => k.id === c.classId)) ?? [];
  return (
    <>
      <PortalHead title="Fire drill" back="/teacher/more" kicker={d ? `Started ${formatInstant(d.startedAt, 'HH:mm')}` : undefined} />
      <main className="rp-main">
        {!d ? <p className="rp-empty">No fire drill is running.</p> : !mine.length ? <p className="rp-empty">None of your classes have students on site today.</p> : mine.map((c) => {
          const safe = d.safeClassIds.includes(c.classId);
          return (
            <section key={c.classId} className="ra-card" aria-labelledby={`dr-${c.classId}`} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h2 id={`dr-${c.classId}`} style={{ margin: 0, fontSize: 16 }}>{c.name} · {c.students.length} {c.registerTaken ? 'on site' : 'on roll (register not taken)'}</h2>
                <ActionButton action={drillSafeAction.bind(null, c.classId, !safe)} label={safe ? 'Undo all safe' : 'All safe'} className={`ra-btn tap${safe ? '' : ' primary'}`} />
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{c.students.map((s) => <li key={s.id}>{s.name}{s.hasMedical ? ' (medical)' : ''}</li>)}</ul>
            </section>
          );
        })}
      </main>
    </>
  );
}
