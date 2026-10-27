import Link from 'next/link';
import { PushToggle } from '@/app/_portal/PushToggle';
import { vapidKeys } from '@/server/comm/push';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Icon } from '@/components/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { plural } from '@/lib/text';
import { requireParent } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { familyFees, payOptions } from '@/server/portal/fees';
import { partyUnread } from '@/server/portal/messages';
import { childFigures, nextClass, schoolNews, unconfirmed } from '@/server/portal/parent';
import { KidSwitch, NoKids, pickKid } from './kids';

export const metadata = { title: 'Home' };

/** §20 Parent home (design: ParentHome): child switcher, next class and figures, quick actions, fees due, news from the school. */
export default async function ParentHome({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent();
  const [todo, unread] = await Promise.all([unconfirmed(db, p.ctx), partyUnread(db, p.party)]);
  if (todo.length) redirect(`/parent/child?child=${todo[0]!.id}&confirm=1`);
  const kid = pickKid(p, (await searchParams).child);
  const fees = shows(p.ctx, 'Fees');
  if (fees && (await payOptions(db, p.ctx)).mustSetUpDirectDebit) redirect('/parent/fees?setup=1');
  const now = new Date();
  const [next, figs, money, news] = await Promise.all([
    kid ? nextClass(db, kid, now) : null, kid && p.ctx.year ? childFigures(db, kid, p.ctx.year.startsOn, now) : null,
    fees ? familyFees(db, p.ctx) : null, schoolNews(db, p.ctx.kids, p.ctx.year?.id ?? null)
  ]);
  return (
    <>
      <PortalHead kicker={formatInstant(now, 'EEEE d MMMM')} title={`Hello, ${p.ctx.contact.name.split(/\s+/)[0]}`}>
        <ThemeToggle className="rp-icon-btn tap" />
        <Link className="rp-icon-btn tap" href="/parent/messages" aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
          <Icon name="mail" />{unread > 0 && <span className="rp-badge" aria-hidden="true">{unread}</span>}
        </Link>
      </PortalHead>
      <main className="rp-main">
        <PushToggle portal="parent" publicKey={(await vapidKeys(db)).publicKey} variant="card" />
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent" />
            <section className="rp-hero" aria-label={`${kid.label} at a glance`}>
              <div className="rp-hero-top">
                <div><small>Next class</small><b>{next?.when ?? (kid.className ? 'None in the next two weeks' : 'Not in a class yet')}</b></div>
                {next?.teacher && <span className="pill">{next.teacher}</span>}
              </div>
              <div className="rp-stats">
                <div><strong>{figs?.attendance.standardPct == null ? '—' : `${figs.attendance.standardPct.toFixed(1)}%`}</strong><span>attendance</span></div>
                <div><strong>{figs?.homeworkDue ?? 0}</strong><span>homework due</span></div>
                <div><strong>{figs?.merits ?? 0}</strong><span>merits</span></div>
              </div>
            </section>
            <div className="rp-tiles">
              {shows(p.ctx, 'Attendance') && <Link className="rp-tile tap" href={`/parent/attendance/notice?child=${kid.id}`}><Icon name="clock" /><span>Report absent or late</span></Link>}
              {shows(p.ctx, 'Holiday Requests') && <Link className="rp-tile tap" href="/parent/attendance/holiday"><Icon name="calendar" /><span>Request a holiday</span></Link>}
            </div>
          </>
        )}
        {money && (money.outstanding > 0 ? (
          <Link className="rp-row tap" href="/parent/fees">
            <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-violet)' }}><Icon name="pound" /></span>
            <span><b>{money.nextDue ? `${formatPence(money.outstanding)} to pay · next due ${formatCalendarDate(money.nextDue.dueDate)}` : `${formatPence(money.outstanding)} overdue`}</b>
              <small>{plural(money.unpaid.length, 'unpaid invoice')}{p.ctx.kids.length > 1 ? ' across your children' : ''}</small></span>
            <span className="go">Pay</span>
          </Link>
        ) : (
          <Link className="rp-row tap" href="/parent/fees">
            <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-blue)' }}><Icon name="check" /></span>
            <span><b>Fees are up to date</b><small>Nothing to pay right now</small></span><span className="go">Fees</span>
          </Link>
        ))}
        <section className="ra-card" aria-labelledby="h-news">
          <h2 id="h-news" style={{ margin: '0 0 10px' }}>From the school</h2>
          {news.holidays.length + news.events.length === 0 ? <p className="ra-muted" style={{ margin: 0 }}>Nothing new right now.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {news.holidays.map((h) => <li key={`h${h.id}`} style={{ display: 'flex', gap: 12 }}><span className="ra-dot" style={{ background: 'var(--ra-blue)', marginTop: 7, flex: 'none' }} aria-hidden="true" />
                <span>{h.title}: no classes {h.startsOn === h.endsOn ? `on ${formatCalendarDate(h.startsOn)}` : `${formatCalendarDate(h.startsOn)} to ${formatCalendarDate(h.endsOn)}`}.{h.description ? ` ${h.description}` : ''}</span></li>)}
              {news.events.map((e) => <li key={`e${e.id}`} style={{ display: 'flex', gap: 12 }}><span className="ra-dot" style={{ marginTop: 7, flex: 'none' }} aria-hidden="true" />
                <span>{e.name} on {formatCalendarDate(e.date)}{e.optInDeadline ? `: please opt in by ${formatCalendarDate(e.optInDeadline)}` : ''}. {shows(p.ctx, 'Events') && <Link href="/parent/events">Open</Link>}</span></li>)}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
