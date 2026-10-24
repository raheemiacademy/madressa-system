import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { formatCalendarDate } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { childAttendance, sentRequests } from '@/server/portal/parent';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Attendance' };
const MARK: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent', left_early: 'Left early', not_counted: 'Not counted' };
const REQ: Record<string, string> = { Pending: 'var(--ra-blue)', Accepted: 'var(--color-ok)', Declined: 'var(--color-bad)', 'Info requested': 'var(--ra-violet)' };

/** §20 Attendance: this year's figure, recent registers, and the notices and holiday requests sent to the school. */
export default async function Attendance({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Attendance');
  const kid = pickKid(p, (await searchParams).child);
  const [att, sent] = await Promise.all([kid && p.ctx.year ? childAttendance(db, kid, p.ctx.year.startsOn) : null, sentRequests(db, p.ctx)]);
  const s = att?.summary;
  return (
    <>
      <PortalHead title="Attendance" kicker={kid ? `${kid.label}${kid.className ? ` · ${kid.className}` : ''}` : undefined} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/attendance" />
            <div className="rp-tiles">
              <div className="rp-tile"><small>This year</small><strong>{s?.standardPct == null ? '—' : `${s.standardPct.toFixed(1)}%`}</strong></div>
              <div className="rp-tile"><small>Late</small><strong>{s?.late ?? 0}</strong></div>
              <div className="rp-tile"><small>Absent</small><strong>{s?.absent ?? 0}</strong></div>
            </div>
            <div className="rp-tiles">
              <Link className="rp-tile tap" href={`/parent/attendance/notice?child=${kid.id}`}><Icon name="clock" /><span>Report absent or late</span></Link>
              {shows(p.ctx, 'Holiday Requests') && <Link className="rp-tile tap" href="/parent/attendance/holiday"><Icon name="calendar" /><span>Request a holiday</span></Link>}
            </div>
            <h2>Recent registers</h2>
            {!att?.recent.length ? <p className="rp-empty">No registers taken yet this year.</p> : (
              <ul className="rp-list">
                {att.recent.map((m) => (
                  <li key={m.id}>
                    <span className="t">{formatCalendarDate(m.date)}</span>
                    <span className="v"><Chip colour={m.mark === 'present' ? 'var(--color-ok)' : m.mark === 'late' ? 'var(--color-warn)' : m.mark === 'absent' ? 'var(--color-bad)' : undefined}>{MARK[m.mark] ?? m.mark}</Chip></span>
                    <span className="m">{m.startTime.slice(0, 5)}{m.code ? ` · ${att.codes[m.code]?.description ?? m.code}` : ''}{m.authorised === true ? ' · authorised' : m.authorised === false && m.mark === 'absent' ? ' · not authorised' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <h2>Notices you’ve sent</h2>
        {!sent.notices.length ? <p className="rp-empty">No notices in the last 30 days.</p> : (
          <ul className="rp-list">
            {sent.notices.map((n) => (
              <li key={n.id}>
                <span className="t">{p.ctx.kids.find((k) => k.id === n.studentId)?.label}: {n.kind === 'late' ? `late${n.expectedArrival ? `, arriving ${n.expectedArrival.slice(0, 5)}` : ''}` : 'absent'}</span>
                <span className="v ra-muted">{formatCalendarDate(n.date)}</span>
                {n.reason && <span className="m">{n.reason}</span>}
              </li>
            ))}
          </ul>
        )}
        {shows(p.ctx, 'Holiday Requests') && (
          <>
            <h2>Holiday requests</h2>
            {!sent.requests.length ? <p className="rp-empty">No holiday requests yet.</p> : (
              <ul className="rp-list">
                {sent.requests.map(({ r, kids }) => (
                  <li key={r.id}>
                    <span className="t">{kids}: {formatCalendarDate(r.startsOn)} to {formatCalendarDate(r.endsOn)}</span>
                    <span className="v"><Chip colour={REQ[r.status]}>{r.status}</Chip></span>
                    <span className="m">{r.response ? `School: ${r.response}` : r.request}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
