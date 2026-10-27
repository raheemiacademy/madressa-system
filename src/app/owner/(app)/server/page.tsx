import Link from 'next/link';
import { formatInstant } from '@/lib/dates';
import { duration, num, size, sizeOf, whenShort } from '@/lib/owner-format';
import { LATEST } from '@/lib/releases';
import { getOwnerState, requireOwner } from '@/server/next/owner';
import { DISK_LIMIT, lastBackupRun, MEMORY_LIMIT, weekSeries } from '@/server/owner/checks';
import { Chart } from '../../_ui/Chart';
import { NotYet, Page } from '../../_ui/parts';

export const metadata = { title: 'Server' };

const stateText = (c: { state: string; exitCode: number }) => c.state === 'exited' ? `Exited (${c.exitCode})` : c.state[0]!.toUpperCase() + c.state.slice(1);

export default async function ServerPage() {
  await requireOwner();
  const s = await getOwnerState(), h = s.health, now = s.now;
  if (!h) return <Page title="Server"><NotYet title={s.healthProblem!}>The server script writes it every 5 minutes. On the server, run <code>./owner-health</code> to see why it stopped.</NotYet></Page>;

  const metric = (k: string, title: string, nowPct: number | null, text: string, col: 1 | 2 | 3, limit: number) => {
    const { vals, labels } = weekSeries(h.history, col, now);
    return (
      <section className="card c4" aria-labelledby={`h-${k}`}>
        <div className="card-h"><h2 id={`h-${k}`}>{title}</h2><span className={limit && nowPct !== null && nowPct >= limit ? 'status bad' : 'status'}>{nowPct === null ? '—' : `${nowPct}% now`}</span></div>
        <p className="note">{text}</p>
        <Chart vals={vals} labels={labels} h={140} axis max={100} limit={limit} unit="%" aria={`${title} over 7 days: ${vals.join(', ')} percent`} />
      </section>
    );
  };
  const M = s.madrasahs, onLatest = M.filter((m) => m.summary?.version === LATEST.version).length;
  return (
    <Page title="Server">
      {h.errors.length > 0 && <div className="strip warn"><span className="dot" /><span className="strip-text"><b>Part of the last reading failed.</b> {h.errors.join('; ')}</span></div>}
      <div className="grid">
        {metric('disk', 'Disk', s.disk, h.disk ? `${sizeOf(h.disk.usedBytes, h.disk.totalBytes)} used` : 'No reading', 1, DISK_LIMIT)}
        {metric('mem', 'Memory', s.memory, h.memory ? `${sizeOf(h.memory.usedBytes, h.memory.totalBytes)} used` : 'No reading', 2, MEMORY_LIMIT)}
        {metric('cpu', 'CPU', s.cpu === null ? null : Math.round(s.cpu), 'Average across cores', 3, 0)}
      </div>
      <div className="grid">
        <section className="card c6" aria-labelledby="h-cont">
          <div className="card-h"><h2 id="h-cont">Containers</h2><p className="note">{num(h.containers?.length ?? 0)} total</p></div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Containers table"><table className="t">
            <thead><tr><th scope="col">Container</th><th scope="col">State</th><th scope="col">Up for</th><th scope="col" className="r">Memory</th></tr></thead>
            <tbody>{(h.containers ?? []).map((c) => (
              <tr key={c.name}><td><code>{c.name}</code></td><td><span className={`status${c.state === 'running' ? '' : ' bad'}`}>{stateText(c)}</span></td>
                <td>{c.state === 'running' ? duration(now.getTime() - new Date(c.startedAt).getTime()) : '—'}</td><td className="r">{size(c.memoryBytes)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="card c6" aria-labelledby="h-bk">
          <div className="card-h"><h2 id="h-bk">Backups</h2><p className="note">Nightly at {formatInstant(lastBackupRun(now), 'HH:mm')}</p></div>
          {M.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Backups table"><table className="t">
            <thead><tr><th scope="col">Madrasah</th><th scope="col">Last night</th><th scope="col">Newest</th><th scope="col" className="r">Size</th></tr></thead>
            <tbody>{M.map((m) => (
              <tr key={m.name}><td><Link className="name" href={`/owner/madrasahs/${encodeURIComponent(m.name)}`} translate="no">{m.name}</Link></td>
                <td>{m.backup?.lastNightRan ? <span className="status">Ran</span> : <span className="status bad">Didn’t run</span>}</td>
                <td className="nw">{m.backup ? <>{whenShort(m.backup.at, now)} <span className="addr">{num(Math.floor((now.getTime() - m.backup.at.getTime()) / 3_600_000))} hours old</span></> : 'None yet'}</td>
                <td className="r">{size(m.backup?.sizeBytes)}</td></tr>
            ))}</tbody>
          </table></div> : <div className="empty">No madrasahs to back up yet.</div>}
          <p className="note">Off-server copies: not set up yet.</p>
        </section>
      </div>
      <section className="card" aria-labelledby="h-ver">
        <div className="card-h"><h2 id="h-ver">Version</h2></div>
        <div className="kv">
          <div><small>Deployed</small><strong>{LATEST.version}</strong></div>
          <div><small>When</small><strong>{h.imageCreatedAt ? formatInstant(new Date(h.imageCreatedAt), 'd MMM yyyy, HH:mm') : '—'}</strong></div>
          <div><small>Madrasahs on it</small><strong>{num(onLatest)} of {num(M.length)}</strong></div>
        </div>
      </section>
    </Page>
  );
}
