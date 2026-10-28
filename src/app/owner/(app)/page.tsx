import Link from 'next/link';
import { ago, num, plural } from '@/lib/owner-format';
import { getOwnerState, requireOwner } from '@/server/next/owner';
import { DISK_LIMIT, MEMORY_LIMIT, type OwnerState, weeklyTotals } from '@/server/owner/checks';
import { Chart } from '../_ui/Chart';
import { Page } from '../_ui/parts';

export const metadata = { title: { absolute: 'Madressa Owner' } };

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** One weekly figure: this week's number, the change on last week, and 8 weeks as a small chart. */
function Week({ label, vals, labels, of }: { label: string; vals: number[]; labels: string[]; of?: number }) {
  const d = vals.length > 1 ? vals.at(-1)! - vals.at(-2)! : 0;
  return (
    <div>
      <span className="label">{label}</span>
      <span className="big">{num(vals.at(-1))}{of ? <small> of {num(of)}</small> : null}</span>
      {d ? <span className={`delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '+' : '−'}{num(Math.abs(d))} on last week</span> : <span className="delta flat">No change on last week</span>}
      <Chart vals={vals} labels={labels} h={40} aria={`${label}, last ${vals.length} weeks: ${vals.join(', ')}`} />
    </div>
  );
}

const meterCls = (v: number, warn: number, bad: number) => `meter${v >= bad ? ' bad' : v >= warn ? ' warn' : ''}`;

function Strip({ s }: { s: OwnerState }) {
  const M = s.madrasahs, down = M.filter((m) => m.status === 'down'), flagged = M.filter((m) => m.attention);
  if (!s.health) return <Link className="strip warn" href="/owner/server"><span className="dot" /><span className="strip-text"><b>{s.healthProblem}.</b> The madrasahs can’t be checked until it’s back.</span><span className="go">Open</span></Link>;
  if (!M.length) return <Link className="strip ok" href="/owner/madrasahs"><span className="dot" /><span className="strip-text"><b>No madrasahs yet.</b> Add the first one on the Madrasahs page.</span><span className="go">Open</span></Link>;
  if (down.length) return <Link className="strip bad" href={`/owner/madrasahs/${encodeURIComponent(down[0]!.name)}`}><span className="dot" /><span className="strip-text"><b>{num(down.length)} {plural(down.length, 'madrasah is', 'madrasahs are')} down.</b> {down[0]!.name}: {down[0]!.attention!.text}</span><span className="go">Open</span></Link>;
  if (!s.lastCheckAt) return <div className="strip ok"><span className="dot" /><span className="strip-text"><b>Waiting for the first check.</b> Every madrasah is asked every 5 minutes.</span></div>;
  const live = M.filter((m) => m.status !== 'paused').length, paused = M.length - live ? ` ${num(M.length - live)} paused.` : '';
  if (flagged.length) return <Link className="strip warn" href="/owner/madrasahs"><span className="dot" /><span className="strip-text"><b>All {num(live)} {plural(live, 'madrasah', 'madrasahs')} running.</b>{paused} {num(flagged.length)} {plural(flagged.length, 'needs', 'need')} attention.</span><span className="go">Review</span></Link>;
  return <div className="strip ok"><span className="dot" /><span className="strip-text"><b>All {num(live)} {plural(live, 'madrasah', 'madrasahs')} running.</b>{paused} Nothing needs you.</span></div>;
}

export default async function OverviewPage() {
  await requireOwner();
  const s = await getOwnerState();
  const M = s.madrasahs, up = M.filter((m) => m.status === 'up').length, live = M.filter((m) => m.status !== 'paused').length;
  const failed = M.filter((m) => !m.backup?.lastNightRan);
  const w = weeklyTotals(M), labels = w.starts.map((d) => `Week of ${weekLabel(d)}`);
  const tiles = [
    <Link key="up" className="tile" href="/owner/madrasahs"><span className="label">Madrasahs up</span><span className="big">{num(up)} <small>of {num(live)}</small></span>
      <span className="sub">{M.length ? `${up === live ? 'All responding' : `${num(live - up)} not responding`}${live < M.length ? ` · ${num(M.length - live)} paused` : ''}` : 'None added yet'}</span></Link>,
    <Link key="leads" className="tile" href="/owner/leads"><span className="label">New leads</span><span className="big">{num(s.newLeads)}</span><span className="sub">{s.newLeads ? 'Waiting for a reply' : 'All replied to'}</span></Link>,
    <Link key="bk" className="tile" href="/owner/server"><span className="label">Last night’s backups</span>
      <span className="big">{M.length ? (failed.length ? <>{num(M.length - failed.length)} <small>of {num(M.length)} OK</small></> : 'All OK') : '—'}</span>
      <span className="sub">{failed.length ? `${failed.slice(0, 2).map((m) => m.name).join(', ')}${failed.length > 2 ? ` and ${failed.length - 2} more` : ''} ${plural(failed.length, 'needs', 'need')} a look` : M.length ? 'Every madrasah backed up' : 'Nothing to back up yet'}</span></Link>,
    <Link key="srv" className="tile" href="/owner/server"><span className="label">Server</span>
      {s.disk === null || s.memory === null ? <span className="big">—</span> : <>
        <div className="meter-row"><span>Disk</span><span className={meterCls(s.disk, 75, DISK_LIMIT)}><i style={{ width: `${s.disk}%` }} /></span><span>{s.disk}%</span></div>
        <div className="meter-row"><span>Memory</span><span className={meterCls(s.memory, 80, MEMORY_LIMIT)}><i style={{ width: `${s.memory}%` }} /></span><span>{s.memory}%</span></div>
      </>}
      <span className="sub">{s.disk === null || s.memory === null ? 'No reading yet' : s.disk >= DISK_LIMIT || s.memory >= MEMORY_LIMIT ? 'Over the alert limit' : 'Within limits'}</span></Link>
  ];
  return (
    <Page title="Overview" className="first-view">
      <Strip s={s} />
      <div className="grid">{tiles.map((t, i) => <div key={i} className="c3" style={{ '--i': i + 1 } as React.CSSProperties}>{t}</div>)}</div>
      <div className="grid">
        <section className="card c7" aria-labelledby="h-needs">
          <div className="card-h"><h2 id="h-needs">Needs you</h2><p className="note">Newest first</p></div>
          {s.needs.length ? <>
            <ul className="list">{s.needs.slice(0, 6).map((x, i) => (
              <li key={i}><Link className="need" href={x.href}><span className={`dot ${x.kind}`} /><span>{x.lead ? <>{x.text} <b>{x.name}</b></> : x.name ? <><b>{x.name}</b>: {x.text}</> : x.text}</span><time dateTime={x.at.toISOString()}>{ago(x.at, s.now)}</time></Link></li>
            ))}</ul>
            {s.needs.length > 6 && <Link href="/owner/alerts">See all {num(s.needs.length)}</Link>}
          </> : <div className="empty"><b>Nothing needs you</b>Problems, new leads and messages appear here, newest first.</div>}
        </section>
        <section className="card c5" aria-labelledby="h-week">
          <div className="card-h"><h2 id="h-week">This week across all madrasahs</h2>{w.starts.length > 0 && <p className="note">Week of {weekLabel(w.starts.at(-1)!)}</p>}</div>
          {w.starts.length ? <div className="week">
            <Week label="Students" vals={w.students} labels={labels} />
            <Week label="Registers taken" vals={w.registers} labels={labels} of={w.registersPlanned} />
            <Week label="Parent logins" vals={w.parentLogins} labels={labels} />
            <Week label="Messages sent" vals={w.messages} labels={labels} />
          </div> : <div className="empty"><b>No numbers yet</b>They appear once the madrasahs have answered a check.</div>}
        </section>
      </div>
    </Page>
  );
}
