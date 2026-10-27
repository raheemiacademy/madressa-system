import Link from 'next/link';
import { ago, num, plural } from '@/lib/owner-format';
import { getOwnerState, requireOwner } from '@/server/next/owner';
import { DISK_LIMIT, MEMORY_LIMIT, type OwnerState } from '@/server/owner/checks';
import { Page } from '../_ui/parts';

export const metadata = { title: { absolute: 'Madressa Owner' } };

const meterCls = (v: number, warn: number, bad: number) => `meter${v >= bad ? ' bad' : v >= warn ? ' warn' : ''}`;

function Strip({ s }: { s: OwnerState }) {
  const M = s.madrasahs, down = M.filter((m) => m.status === 'down'), flagged = M.filter((m) => m.attention);
  if (!s.health) return <Link className="strip warn" href="/owner/server"><span className="dot" /><span className="strip-text"><b>{s.healthProblem}.</b> The madrasahs can’t be checked until it’s back.</span><span className="go">Open</span></Link>;
  if (!M.length) return <Link className="strip ok" href="/owner/server"><span className="dot" /><span className="strip-text"><b>No madrasahs yet.</b> Add the first one on the server with <code>./madrasah add &lt;name&gt;</code>.</span></Link>;
  if (down.length) return <Link className="strip bad" href="/owner/madrasahs"><span className="dot" /><span className="strip-text"><b>{num(down.length)} {plural(down.length, 'madrasah is', 'madrasahs are')} down.</b> {down[0]!.name}: {down[0]!.attention!.text}</span><span className="go">Open</span></Link>;
  if (!s.lastCheckAt) return <div className="strip ok"><span className="dot" /><span className="strip-text"><b>Waiting for the first check.</b> Every madrasah is asked every 5 minutes.</span></div>;
  if (flagged.length) return <Link className="strip warn" href="/owner/madrasahs"><span className="dot" /><span className="strip-text"><b>All {num(M.length)} {plural(M.length, 'madrasah', 'madrasahs')} running.</b> {num(flagged.length)} {plural(flagged.length, 'needs', 'need')} attention.</span><span className="go">Review</span></Link>;
  return <div className="strip ok"><span className="dot" /><span className="strip-text"><b>All {num(M.length)} {plural(M.length, 'madrasah', 'madrasahs')} running.</b> Nothing needs you.</span></div>;
}

export default async function OverviewPage() {
  await requireOwner();
  const s = await getOwnerState();
  const M = s.madrasahs, up = M.filter((m) => m.status === 'up').length;
  const failed = M.filter((m) => !m.backup?.lastNightRan);
  const tiles = [
    <Link key="up" className="tile" href="/owner/madrasahs"><span className="label">Madrasahs up</span><span className="big">{num(up)} <small>of {num(M.length)}</small></span>
      <span className="sub">{M.length ? (up === M.length ? 'All responding' : `${num(M.length - up)} not responding`) : 'None added yet'}</span></Link>,
    <Link key="leads" className="tile" href="/owner/leads"><span className="label">New leads</span><span className="big">—</span><span className="sub">Counted once the leads inbox is built</span></Link>,
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
              <li key={i}><Link className="need" href={x.href}><span className={`dot ${x.kind}`} /><span>{x.name ? <><b>{x.name}</b>: {x.text}</> : x.text}</span><time dateTime={x.at.toISOString()}>{ago(x.at, s.now)}</time></Link></li>
            ))}</ul>
            {s.needs.length > 6 && <Link href="/owner/madrasahs">See all {num(s.needs.length)}</Link>}
          </> : <div className="empty"><b>Nothing needs you</b>Problems, new leads and messages appear here, newest first.</div>}
        </section>
        <section className="card c5" aria-labelledby="h-week">
          <div className="card-h"><h2 id="h-week">This week across all madrasahs</h2></div>
          <div className="empty"><b>Weekly totals come next</b>Students, registers taken, parent logins and messages sent, with their trends.</div>
        </section>
      </div>
    </Page>
  );
}
