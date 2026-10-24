import Link from 'next/link';
import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { addDays } from '@/server/attendance/registers';
import { noticesOn } from '@/server/attendance/requests';
import { todayIso } from '@/server/people/common';
import { seenNoticeAction } from '../actions';

export const metadata = { title: 'Parent notices' };

export default async function Notices({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireAdmin();
  const d = (await searchParams).date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d! : todayIso();
  const rows = await noticesOn(db, date);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Parent absence notices</h1><p>“Will be absent today” and “will be late today” notices for {formatCalendarDate(date, 'EEEE d MMMM')}. They also show on the register.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`?date=${addDays(date, -1)}`}>Previous day</Link><Link className="ra-btn" href={`?date=${addDays(date, 1)}`}>Next day</Link></div></div>
      <section className="ra-card">
        <div className="ra-note">{plural(rows.length, 'notice')}</div>
        {rows.length === 0 ? <p className="ra-empty">No notices for this day.</p> : (
          <table className="ra-table"><thead><tr><th>Student</th><th className="opt">Class</th><th>Notice</th><th>Reason</th><th className="opt">From</th><th><span className="sr-only">Seen</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.n.id}>
                <td className="wrap"><Link href={`/admin/register/student/${r.n.studentId}`}>{r.firstName} {r.surname}</Link></td><td className="opt wrap">{r.classes ?? ''}</td>
                <td>{r.n.kind === 'absent' ? 'Absent' : `Late${r.n.expectedArrival ? `, about ${r.n.expectedArrival.slice(0, 5)}` : ''}`}</td>
                <td className="wrap">{r.n.reason ?? ''}</td><td className="opt wrap">{r.contact ?? ''}<div className="ra-note">{formatInstant(r.n.createdAt, 'HH:mm')}</div></td>
                <td>{r.n.seenAt ? <span className="ra-muted">Seen</span> : <ActionButton className="ra-link" action={seenNoticeAction.bind(null, r.n.id)} label="Mark seen" />}</td>
              </tr>
            ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
