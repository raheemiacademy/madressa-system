import Link from 'next/link';
import { WhatsAppReminders } from '@/components/WhatsAppReminders';
import { remindFamilies } from '@/server/comm/whatsapp';
import { db } from '@/db';
import { pct1 } from '@/lib/attendance';
import { formatCalendarDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { alertCandidates } from '@/server/attendance/reports';
import { todayIso } from '@/server/people/common';
import { ActionButton } from '@/components/Form';
import { adminCan } from '@/server/permissions';
import { sendAlertsAction } from '../actions';

export const metadata = { title: 'Attendance alerts' };

export default async function Alerts() {
  const admin = await requireAdmin();
  const r = await alertCandidates(db, todayIso());
  const s = r.settings;
  const wa = await remindFamilies(db, r.low.map((a) => ({ studentId: a.student.id, name: a.student.firstName, pct: pct1(a.summary.standardPct) })), (first, mine, school) =>
    `Salaam ${first}, ${mine.map((k) => `${k.name}’s attendance at ${school} is ${k.pct}`).join(', and ')} over the last ${String(s.intervalDays)} days. Please get in touch if there’s anything we should know. JazakAllahu khairan.`);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Attendance alerts</h1><p>Students whose attendance crosses your alert settings over the last {String(s.intervalDays)} days (since {formatCalendarDate(r.from)}).</p></div>
        <div className="ra-toolbar">
          {adminCan(admin.staff, 'edit') && <ActionButton className="ra-btn primary" action={sendAlertsAction} label="Send alert emails now" confirm="Email the contacts of the students listed? Anyone already emailed in this period is skipped." />}
          <Link className="ra-btn" href="/admin/settings/alerts">Alert settings</Link></div></div>
      <div className="ra-banner" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div>
        Alerts are {s.enabled ? <b>on</b> : <b>off</b>}: below {String(s.thresholdPct)}%, or {String(s.absences)}+ absences, or {String(s.lates)}+ lates. {s.enabled ? 'Emails go out each morning to primary contacts, at most once per period per student.' : 'Turn alerts on to email them each morning, or send them now.'}
      </div></div>
      <section className="ra-card" aria-labelledby="al-h">
        <div className="ra-card-h"><div><h2 id="al-h">Attendance concerns</h2><div className="ra-note">{plural(r.low.length, 'student')}</div></div></div>
        {r.low.length === 0 ? <p className="ra-empty">No students cross the alert settings.</p> : (
          <table className="ra-table"><thead><tr><th>Student</th><th className="num">Attendance</th><th>Why</th></tr></thead>
            <tbody>{r.low.map((a) => <tr key={a.student.id}><td className="wrap"><Link href={`/admin/register/student/${a.student.id}`}>{a.student.firstName} {a.student.surname}</Link></td><td className="num">{pct1(a.summary.standardPct)}</td><td className="wrap">{a.reasons.join(', ')}</td></tr>)}</tbody></table>
        )}
      </section>
      <WhatsAppReminders title="Message these families on WhatsApp" list={wa} />
      {s.highAttendance ? (
        <section className="ra-card" aria-labelledby="hi-h">
          <div className="ra-card-h"><div><h2 id="hi-h">High attendance</h2><div className="ra-note">At or above {String(s.highPct)}%</div></div></div>
          {r.high.length === 0 ? <p className="ra-empty">None yet.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{r.high.map((a) => <li key={a.student.id}>{a.student.firstName} {a.student.surname} · {pct1(a.summary.standardPct)}</li>)}</ul>}
        </section>
      ) : null}
    </div>
  );
}
