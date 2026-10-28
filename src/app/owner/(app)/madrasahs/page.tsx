import Link from 'next/link';
import { db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { ago, whenShort } from '@/lib/owner-format';
import { getOwnerState, requireOwner } from '@/server/next/owner';
import { mainHost, recentChanges } from '@/server/owner/manage';
import { NotYet, Page } from '../../_ui/parts';
import { MadrasahList, type Row } from './MadrasahList';
import { AddMadrasah } from './Manage';
import { changeLine } from './change-line';

export const metadata = { title: 'Madrasahs' };

export default async function MadrasahsPage() {
  await requireOwner();
  const s = await getOwnerState();
  const changes = await recentChanges(db, s.now);
  const rows: Row[] = s.madrasahs.map((m) => {
    const c = m.summary?.counts, lastActive = m.summary?.lastActiveAt ? new Date(m.summary.lastActiveAt) : null;
    return {
      name: m.name, host: m.host, version: m.summary?.version ?? null, status: m.status, attention: m.attention?.text ?? null,
      students: c?.students ?? null, teachers: c?.teachers ?? null, parents: c?.parents ?? null, parentsWithLogin: c?.parentsWithLogin ?? null,
      lastActive: m.summary ? ago(lastActive, s.now) : '—', quietDays: lastActive ? (s.now.getTime() - lastActive.getTime()) / 86_400_000 : 1e6,
      backup: m.backup ? (m.backup.lastNightRan ? whenShort(m.backup.at, s.now) : `Didn’t run last night`) : 'None yet', backupOk: !!m.backup?.lastNightRan,
      fees: m.summary?.money ? { collected: m.summary.money.month.collected, invoiced: m.summary.money.month.invoiced } : null,
      score: m.status === 'paused' ? -1 : (m.status === 'down' ? 100 : 0) + (m.attention ? 10 : 0) + (m.backup?.lastNightRan ? 0 : 5)
    };
  });
  return (
    <Page title="Madrasahs">
      <div className="toolbar"><AddMadrasah host={mainHost()} /></div>
      {changes.length > 0 && (
        <section className="card" aria-labelledby="h-changes">
          <div className="card-h"><h2 id="h-changes">Changes today</h2><p className="note">Done by the server within a minute of asking</p></div>
          <ul className="changes">{changes.map((c) => {
            const l = changeLine(c, formatInstant);
            const there = s.madrasahs.some((m) => m.name === c.madrasah);
            return (
              <li key={c.id}><span className={`status${l.tone ? ` ${l.tone}` : ''}`}>{l.state}</span>
                <span>{there && c.action !== 'remove' ? <Link href={`/owner/madrasahs/${encodeURIComponent(c.madrasah)}`} translate="no">{c.madrasah}</Link> : <b translate="no">{c.madrasah}</b>} {l.text}</span></li>
            );
          })}</ul>
        </section>
      )}
      {rows.length ? <MadrasahList rows={rows} />
        : <NotYet title="No madrasahs yet">Add the first one with <b>Add madrasah</b>. It appears here once the server has set it up.</NotYet>}
    </Page>
  );
}
