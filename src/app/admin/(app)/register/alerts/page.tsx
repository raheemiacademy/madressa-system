import Link from 'next/link';
import { db } from '@/db';
import { pct1 } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { alertCandidates } from '@/server/attendance/reports';
import { todayIso } from '@/server/people/common';

export const metadata = { title: 'Attendance alerts' };

export default async function Alerts() {
  await requireAdmin();
  const r = await alertCandidates(db, todayIso());
  const s = r.settings;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Attendance alerts</h1><p>Students whose attendance crosses your alert settings over the last {String(s.intervalDays)} days (since {formatCalendarDate(r.from)}).</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/settings/alerts">Alert settings</Link></div></div>
      <div className="ra-banner" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div>
        Alerts are {s.enabled ? <b>on</b> : <b>off</b>}: below {String(s.thresholdPct)}%, or {String(s.absences)}+ absences, or {String(s.lates)}+ lates. Alert emails aren’t being sent yet, because email sending hasn’t been switched on. This list shows who would get one.
      </div></div>
      <section className="ra-card" aria-labelledby="al-h">
        <div className="ra-card-h"><div><h2 id="al-h">Attendance concerns</h2><div className="ra-note">{plural(r.low.length, 'student')}</div></div></div>
        {r.low.length === 0 ? <p className="ra-empty">No students cross the alert settings.</p> : (
          <table className="ra-table"><thead><tr><th>Student</th><th className="num">Attendance</th><th>Why</th></tr></thead>
            <tbody>{r.low.map((a) => <tr key={a.student.id}><td className="wrap"><Link href={`/admin/register/student/${a.student.id}`}>{a.student.firstName} {a.student.surname}</Link></td><td className="num">{pct1(a.summary.standardPct)}</td><td className="wrap">{a.reasons.join(', ')}</td></tr>)}</tbody></table>
        )}
      </section>
      {s.highAttendance ? (
        <section className="ra-card" aria-labelledby="hi-h">
          <div className="ra-card-h"><div><h2 id="hi-h">High attendance</h2><div className="ra-note">At or above {String(s.highPct)}%</div></div></div>
          {r.high.length === 0 ? <p className="ra-empty">None yet.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{r.high.map((a) => <li key={a.student.id}>{a.student.firstName} {a.student.surname} · {pct1(a.summary.standardPct)}</li>)}</ul>}
        </section>
      ) : null}
    </div>
  );
}
