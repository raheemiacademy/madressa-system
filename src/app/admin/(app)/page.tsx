import Link from 'next/link';
import { cookies } from 'next/headers';
import { cache, Suspense, type ReactNode } from 'react';
import { db } from '@/db';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { HBarChart, TrendChart } from '@/components/charts';
import { Icon, type IconName } from '@/components/Icon';
import { formatCalendarDate, formatInstant, greeting } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { STEPS } from '@/lib/onboarding-steps';
import { formatChange, initials, plural } from '@/lib/text';
import { resolveYear } from '@/server/academic-years';
import { weeklyTrend } from '@/server/attendance/registers';
import { countNotices, countPendingRequests } from '@/server/attendance/requests';
import { ageGroups, attendanceFigures, outstandingWeekAgo, parentFigures, studentFigures, teacherSignIns, unreadMessages } from '@/server/dashboard';
import { dashboard as feesDashboard, paymentList } from '@/server/fees/reports';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { adminCan } from '@/server/permissions';
import { setupProgress } from '@/server/onboarding';
import { getProfile } from '@/server/profile';
import { readTab } from '@/server/settings';
import { PanelBoundary, SeenOnce } from './DashParts';
import { SetupChecklist, Welcome } from './Onboarding';
import { AddFeesButton, AddFeesDialog } from './fees/AddFees';

export const metadata = { title: 'Dashboard' };

// Panels share these reads within one request.
const feesFor = cache((yearId: number) => feesDashboard(db, yearId));
const signInsFor = cache((today: string) => teacherSignIns(db, today));
const headline = cache(async (today: string, yearId: number | null, fees: boolean) => {
  const [students, attendance, signIns, notices, requests, money] = await Promise.all([
    studentFigures(db, today), attendanceFigures(db, today), signInsFor(today), countNotices(db, today), countPendingRequests(db),
    fees && yearId ? Promise.all([feesFor(yearId), outstandingWeekAgo(db, yearId)]) : null
  ]);
  return { students, attendance, signIns, notices, requests, fees: money && { outstanding: money[0].totals.outstanding, overdue: money[0].overdueCount, change: money[0].totals.outstanding - money[1] } };
});

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const ROLE: Record<string, string> = { contact: 'Parent', teacher: 'Teacher', admin: 'Admin' };
const SOURCE: Record<string, string> = { kiosk: 'kiosk', portal: 'teacher portal', admin: 'office', import: 'import' };
const tint = (c: string) => ({ ['--c' as string]: `var(${c})` });

function Delta({ v, unit, good }: { v: number; unit: 'count' | 'pts' | 'pence'; good: 'up' | 'down' }) {
  return <span className={v === 0 ? undefined : (v > 0) === (good === 'up') ? 'ra-up' : 'ra-down'}>{formatChange(v, unit)}</span>;
}

function Panel({ id, cls, title, note, action, height, anim, children }: { id: string; cls: string; title: string; note: string; action?: ReactNode; height: number; anim: string; children: ReactNode }) {
  return (
    <section className={`ra-card ${cls}${anim}`} aria-labelledby={`${id}-h`}>
      <div className="ra-card-h"><div><h2 id={`${id}-h`}>{title}</h2><div className="ra-note">{note}</div></div>{action}</div>
      <PanelBoundary><Suspense fallback={<div className="ra-skel" style={{ height }} aria-label={`Loading ${title.toLowerCase()}`} role="status" />}>{children}</Suspense></PanelBoundary>
    </section>
  );
}

/** §1 Dashboard: today's figures, banners, attendance, age groups, unread messages, teacher sign-in, and (with fees access) payments and fees by type. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const admin = await requireAdmin();
  // A new madrasah's setup checklist comes first, for the Super admins who do the setting up.
  const [setup, sp] = await Promise.all([admin.staff.isSuper ? setupProgress(db) : null, searchParams]);
  const jar = await cookies();
  const [local, { year }] = await Promise.all([readTab(db, 'local'), resolveYear(db, Number(jar.get('year_id')?.value) || null)]);
  const tz = local.timezone as string;
  const now = new Date();
  const today = todayIso(now);
  const fees = adminCan(admin.staff, 'fees');
  const me = { id: admin.staff.id, rank: admin.staff.rank, isSuper: admin.staff.isSuper };
  const anim = jar.get('ra_dash_seen') ? '' : ' ra-anim';
  const quick: [string, IconName, string][] = [
    ...(adminCan(admin.staff, 'edit') ? [['/admin/students/new', 'plus', 'Add student'] as [string, IconName, string]] : []),
    ['/admin/register', 'check', 'Take register'], ['/admin/messages/new', 'chat', 'New message']
  ];
  return (
    <div className="ra-page">
      <SeenOnce />
      {setup && sp.welcome === '1' && <Welcome school={(await getProfile(db))?.name ?? 'Your madrasah'} name={admin.name.split(/\s+/)[0]!} firstHref={STEPS[0].href} />}
      {setup && !setup.hidden && <SetupChecklist p={setup} />}
      <div className={`ra-hero${anim}`}>
        <div className="ra-hero-date">{formatInstant(now, 'EEEE d MMMM', tz)}</div>
        <h1>{greeting(now, tz)}, {admin.name.split(/\s+/)[0]}</h1>
        <PanelBoundary>
          <Suspense fallback={<p><span className="ra-skel" style={{ display: 'block', height: '3em', maxWidth: '64ch' }} role="status" aria-label="Loading today’s summary" /></p>}>
            <HeroLine today={today} yearId={year?.id ?? null} fees={fees} />
          </Suspense>
        </PanelBoundary>
        <div className="ra-quick">
          {quick.slice(0, 1).map(([h, i, l]) => <Link key={h} href={h}><Icon name={i} />{l}</Link>)}
          {fees && <AddFeesButton label="Record payment" className="" plus />}
          {quick.slice(1).map(([h, i, l]) => <Link key={h} href={h}><Icon name={i} />{l}</Link>)}
        </div>
      </div>

      <PanelBoundary>
        <Suspense fallback={<div className="ra-kpis" role="status" aria-label="Loading today’s figures">{Array.from({ length: fees ? 5 : 4 }, (_, i) => <div key={i} className="ra-kpi ra-skel" style={{ height: 112 }} />)}</div>}>
          <Headline today={today} yearId={year?.id ?? null} yearStart={year?.startsOn ?? today} fees={fees} anim={anim} />
        </Suspense>
      </PanelBoundary>

      <div className="ra-grid">
        <Panel id="d-att" cls="ra-c8" title="Weekly attendance" note="Share of register sessions marked present or late, this year" height={230} anim={anim}>
          <Trend from={year?.startsOn ?? null} to={year ? (today < year.endsOn ? today : year.endsOn) : null} />
        </Panel>
        <Panel id="d-age" cls="ra-c4" title="Students by age group" note="Current students" height={200} anim={anim}><Ages today={today} /></Panel>
        <Panel id="d-msg" cls="ra-c7" title="Unread messages" note="From parents and teachers" height={200} anim="" action={<Link className="ra-link" href="/admin/messages">Open inbox</Link>}>
          <Messages me={me} />
        </Panel>
        <Panel id="d-tl" cls="ra-c5" title="Teacher sign-in" note="Today, from kiosk and teacher portal" height={200} anim="" action={<Link className="ra-link" href="/admin/teacher-logs">All logs</Link>}>
          <SignIns today={today} />
        </Panel>
        {fees && (
          <>
            <Panel id="d-pay" cls="ra-c7" title="Recent payments" note="Latest ten, all invoice types" height={260} anim="" action={<Link className="ra-link" href="/admin/fees">Fees dashboard</Link>}>
              <Payments />
            </Panel>
            <Panel id="d-ft" cls="ra-c5" title="Fees by type" note={`Received and still outstanding, ${year ? year.title : 'this year'}`} height={200} anim=""><FeesByType yearId={year?.id ?? null} /></Panel>
          </>
        )}
      </div>
      {fees && <AddFeesDialog today={today} methods={PAYMENT_METHODS} statuses={PAYMENT_STATUSES} />}
    </div>
  );
}

async function HeroLine({ today, yearId, fees }: { today: string; yearId: number | null; fees: boolean }) {
  const h = await headline(today, yearId, fees);
  const a = h.attendance, f = h.fees;
  return (
    <p>
      {a.pct === null ? 'No registers have been taken yet today.' : <>Attendance today is <b>{pct1(a.pct)}</b>{a.change !== null && <> ({formatChange(a.change, 'pts')} on last week)</>}.</>}
      {f && (f.overdue > 0
        ? <> <b>{f.overdue.toLocaleString('en-GB')}</b> {f.overdue === 1 ? 'invoice is' : 'invoices are'} overdue, with <b>{formatPence(f.outstanding)}</b> outstanding. Sending reminders is the job for today.</>
        : <> No invoices are overdue{f.outstanding > 0 && <>, and <b>{formatPence(f.outstanding)}</b> is still to come in</>}.</>)}
    </p>
  );
}

async function Headline({ today, yearId, yearStart, fees, anim }: { today: string; yearId: number | null; yearStart: string; fees: boolean; anim: string }) {
  const [h, parents] = await Promise.all([headline(today, yearId, fees), parentFigures(db, yearStart)]);
  const due = h.signIns.rows.length;
  const tiles: [string, string, IconName, ReactNode, ReactNode][] = [
    ['--ra-indigo', 'Current students', 'users', h.students.current.toLocaleString('en-GB'), <><Delta v={h.students.change} unit="count" good="up" /> since last week · {h.students.waiting.toLocaleString('en-GB')} waiting</>],
    ['--ra-blue', 'Attendance today', 'check', h.attendance.pct === null ? '—' : pct1(h.attendance.pct),
      h.attendance.pct === null ? 'No registers taken yet today' : h.attendance.change === null ? 'No register on this day last week' : <><Delta v={h.attendance.change} unit="pts" good="up" /> vs same day last week</>],
    ...(h.fees ? [['--ra-violet', 'Fees outstanding', 'pound', formatPence(h.fees.outstanding), <><Delta v={h.fees.change} unit="pence" good="down" /> since last week</>] as [string, string, IconName, ReactNode, ReactNode]] : []),
    ['--ra-sky', 'Parents on portal', 'phone', parents.active.toLocaleString('en-GB'), `of ${plural(parents.total, 'parent contact')}`],
    ['--ra-lav', 'Teachers signed in', 'clock', h.signIns.signedIn.toLocaleString('en-GB'), due ? `of ${due.toLocaleString('en-GB')} teaching today` : 'No one is due in today']
  ];
  return (
    <>
      {(h.notices > 0 || h.requests > 0) && (
        <div className="ra-banners">
          {h.notices > 0 && (
            <div className="ra-banner" style={tint('--ra-blue')}><span className="ra-banner-ic"><Icon name="bell" /></span>
              <div><b>{h.notices.toLocaleString('en-GB')}</b> {h.notices === 1 ? 'parent notification' : 'parent notifications'} of absent students today</div>
              <Link className="ra-link" href="/admin/register/notices">Review</Link></div>
          )}
          {h.requests > 0 && (
            <div className="ra-banner" style={tint('--ra-violet')}><span className="ra-banner-ic"><Icon name="calendar" /></span>
              <div><b>{h.requests.toLocaleString('en-GB')}</b> {h.requests === 1 ? 'holiday request is' : 'holiday requests are'} waiting for a decision</div>
              <Link className="ra-link" href="/admin/register/requests">Respond</Link></div>
          )}
        </div>
      )}
      <div className="ra-kpis">
        {tiles.map(([c, label, icon, val, sub], i) => (
          <div key={label} className={`ra-kpi${anim}`} style={{ ...tint(c), ['--i' as string]: i + 1 }}>
            <div className="ra-kpi-top">{label}<span className="ra-kpi-ic"><Icon name={icon} /></span></div>
            <div className="ra-kpi-val">{val}</div>
            <div className="ra-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}

async function Trend({ from, to }: { from: string | null; to: string | null }) {
  if (!from || !to || to < from) return <p className="ra-empty">No registers taken yet this year.</p>;
  return <TrendChart data={await weeklyTrend(db, from, to)} empty="No registers taken yet this year." />;
}

async function Ages({ today }: { today: string }) {
  const rows = await ageGroups(db, today);
  const other = rows.some((r) => r.unspecified);
  return (
    <>
      {rows.length > 0 && <div className="ra-legend"><span><i style={{ background: 'var(--ra-indigo)' }} />Boys</span><span><i style={{ background: 'var(--ra-violet)' }} />Girls</span>{other && <span><i style={{ background: 'var(--ra-lav)' }} />Not recorded</span>}</div>}
      <HBarChart empty="No current students yet."
        label={`Students by age group: ${rows.map((r) => `${r.group} ${r.boys} boys, ${r.girls} girls${r.unspecified ? `, ${r.unspecified} not recorded` : ''}`).join('; ')}`}
        rows={rows.map((r) => ({
          label: r.group, end: (r.boys + r.girls + r.unspecified).toLocaleString('en-GB'),
          segs: [{ name: 'Boys', value: r.boys, colour: '--ra-indigo' }, { name: 'Girls', value: r.girls, colour: '--ra-violet' }, { name: 'Not recorded', value: r.unspecified, colour: '--ra-lav' }],
          tip: [`Boys ${r.boys}`, `Girls ${r.girls}`, ...(r.unspecified ? [`Not recorded ${r.unspecified}`] : [])]
        }))} />
    </>
  );
}

async function Messages({ me }: { me: { id: number; rank: string | null; isSuper: boolean } }) {
  const { total, latest } = await unreadMessages(db, me);
  if (!total) return <p className="ra-empty">You’re all caught up: no unread messages.</p>;
  return (
    <>
      <ul className="ra-msg-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {latest.map((t) => (
          <li key={t.id} className="ra-msg-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <Link className="ra-msg" href={`/admin/messages?t=${t.id}`} data-unread="true">
              <span className="ra-avatar" aria-hidden="true">{initials(t.last?.name ?? t.others)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="ra-msg-top"><span className="ra-msg-from">{t.last?.name ?? t.others}</span>{t.last && ROLE[t.last.kind] && <Chip colour="var(--ra-lav)">{ROLE[t.last.kind]!}</Chip>}</span>
                <span className="ra-msg-subj" style={{ display: 'block' }}><span className="sr-only">Unread: </span>{t.subject}</span>
                <span className="ra-msg-prev" style={{ display: 'block' }}>{t.last?.body ?? ''}</span>
              </span>
              <span className="ra-msg-side">{formatInstant(t.lastMessageAt, 'dd/MM HH:mm')}<span className="ra-dot" aria-hidden="true" /></span>
            </Link>
          </li>
        ))}
      </ul>
      {total > latest.length && <p className="ra-note" style={{ margin: '8px 8px 0' }}>{plural(total - latest.length, 'more unread conversation')} in the inbox.</p>}
    </>
  );
}

async function SignIns({ today }: { today: string }) {
  const { rows } = await signInsFor(today);
  if (!rows.length) return <p className="ra-empty">No teachers are due in today.</p>;
  return (
    <div className="ra-table-wrap" style={{ maxHeight: 330 }}>
      <table className="ra-table">
        <thead><tr><th>Teacher</th><th>Signed in</th><th>Signed out</th><th className="opt">Logged at</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="wrap">{r.name}</td>
              <td>{r.absent ? <Chip colour="var(--color-bad)">Absent</Chip> : hhmm(r.timeIn) ?? <span className="ra-muted">Not yet</span>}</td>
              <td>{hhmm(r.timeOut) ?? <span className="ra-muted">—</span>}</td>
              <td className="opt ra-muted">{r.loggedAt ? `${formatInstant(r.loggedAt, 'HH:mm')}, ${SOURCE[r.source ?? ''] ?? r.source}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Payments() {
  const rows = await paymentList(db, { limit: 10 });
  if (!rows.length) return <p className="ra-empty">No payments yet.</p>;
  return (
    <div className="ra-table-wrap">
      <table className="ra-table">
        <thead><tr><th>Payment</th><th className="opt">Date</th><th>Student</th><th className="num">Amount</th><th className="opt">Method</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="ra-muted">#{p.id}</td>
              <td className="opt">{formatCalendarDate(p.receivedOn)}</td>
              <td className="wrap"><Link href={`/admin/fees/student/${p.studentId}`}>{p.studentName}</Link></td>
              <td className="num">{formatPence(p.amountPence)}</td>
              <td className="opt">{p.method}</td>
              <td><Chip>{p.status}</Chip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function FeesByType({ yearId }: { yearId: number | null }) {
  if (!yearId) return <p className="ra-empty">Add an academic year first.</p>;
  const { byType } = await feesFor(yearId);
  return (
    <>
      {byType.length > 0 && <div className="ra-legend"><span><i style={{ background: 'var(--ra-blue)' }} />Received</span><span><i style={{ background: 'var(--ra-violet)' }} />Outstanding</span></div>}
      <HBarChart empty="No invoices this year yet." track
        label={`Fees by type: ${byType.map((t) => `${t.type} ${formatPence(t.received)} received, ${formatPence(t.outstanding)} outstanding`).join('; ')}`}
        rows={byType.map((t) => ({
          label: t.type, end: t.outstanding ? `${formatPence(t.outstanding)} due` : t.received ? 'Paid' : 'No invoices', strong: t.outstanding > 0,
          segs: [{ name: 'Received', value: t.received, colour: '--ra-blue' }, { name: 'Outstanding', value: t.outstanding, colour: '--ra-violet' }],
          tip: [`Received ${formatPence(t.received)}`, `Outstanding ${formatPence(t.outstanding)}`]
        }))} />
    </>
  );
}
