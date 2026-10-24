import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { myLog, myLogs } from '@/server/portal/teacher';
import { adjustLogAction } from '../actions';

export const metadata = { title: 'My log' };

/** §7/§20 The teacher's own sign-in and sign-out times; today's can be adjusted when the school allows it. */
export default async function Logs() {
  const t = await requireTeacher('Teacher Logs');
  const [today, logs] = await Promise.all([myLog(db, t.ctx.teacher.id), myLogs(db, t.ctx.teacher.id)]);
  return (
    <>
      <PortalHead title="My log" back="/teacher/more" />
      <main className="rp-main">
        {!!t.ctx.tab.quickLogAdjust && (
          <Form action={adjustLogAction} submit="Save today’s times" savebar={false}>
            <h2 style={{ margin: 0 }}>Today</h2>
            <div className="ra-fields">
              <TextField name="timeIn" label="Signed in" type="time" defaultValue={today?.timeIn?.slice(0, 5) ?? ''} />
              <TextField name="timeOut" label="Signed out" type="time" defaultValue={today?.timeOut?.slice(0, 5) ?? ''} />
            </div>
          </Form>
        )}
        {!logs.length ? <p className="rp-empty">No logs in the last six weeks.</p> : (
          <ul className="rp-list">
            {logs.map((l) => <li key={l.id}><span className="t">{formatCalendarDate(l.date, 'EEE d MMM')}</span><span className="v">{l.absent ? 'Absent' : `${l.timeIn?.slice(0, 5) ?? '—'} to ${l.timeOut?.slice(0, 5) ?? '—'}`}</span>{l.note && <span className="m">{l.note}</span>}</li>)}
          </ul>
        )}
      </main>
    </>
  );
}
