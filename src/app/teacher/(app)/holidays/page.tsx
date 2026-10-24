import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { myHolidayRequests } from '@/server/portal/teacher';

export const metadata = { title: 'Holiday requests' };
const REQ: Record<string, string> = { Pending: 'var(--ra-blue)', Accepted: 'var(--color-ok)', Declined: 'var(--color-bad)', 'Info requested': 'var(--ra-violet)' };

/** §6/§20 Holiday requests from parents of students in the teacher's classes. Read-only: the office decides. */
export default async function Holidays() {
  const t = await requireTeacher('Holiday Requests');
  const rows = await myHolidayRequests(db, t.ctx);
  return (
    <>
      <PortalHead title="Holiday requests" back="/teacher/more" />
      <main className="rp-main">
        {!rows.length ? <p className="rp-empty">No holiday requests for your students.</p> : (
          <ul className="rp-list">
            {rows.map((r) => <li key={r.r.id}><span className="t">{r.students.map((s) => `${s.firstName} ${s.surname}`).join(', ')}</span><span className="v"><Chip colour={REQ[r.r.status]}>{r.r.status}</Chip></span>
              <span className="m">{formatCalendarDate(r.r.startsOn)} to {formatCalendarDate(r.r.endsOn)} · {r.r.request}</span></li>)}
          </ul>
        )}
      </main>
    </>
  );
}
