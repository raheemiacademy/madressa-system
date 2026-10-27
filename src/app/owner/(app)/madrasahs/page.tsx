import { ago, whenShort } from '@/lib/owner-format';
import { getOwnerState, requireOwner } from '@/server/next/owner';
import { NotYet, Page } from '../../_ui/parts';
import { MadrasahList, type Row } from './MadrasahList';

export const metadata = { title: 'Madrasahs' };

export default async function MadrasahsPage() {
  await requireOwner();
  const s = await getOwnerState();
  const rows: Row[] = s.madrasahs.map((m) => {
    const c = m.summary?.counts, lastActive = m.summary?.lastActiveAt ? new Date(m.summary.lastActiveAt) : null;
    return {
      name: m.name, host: m.host, version: m.summary?.version ?? null, status: m.status, attention: m.attention?.text ?? null,
      students: c?.students ?? null, teachers: c?.teachers ?? null, parents: c?.parents ?? null, parentsWithLogin: c?.parentsWithLogin ?? null,
      lastActive: m.summary ? ago(lastActive, s.now) : '—', quietDays: lastActive ? (s.now.getTime() - lastActive.getTime()) / 86_400_000 : 1e6,
      backup: m.backup ? (m.backup.lastNightRan ? whenShort(m.backup.at, s.now) : `Didn’t run last night`) : 'None yet', backupOk: !!m.backup?.lastNightRan,
      fees: m.summary?.money ? { collected: m.summary.money.month.collected, invoiced: m.summary.money.month.invoiced } : null,
      score: (m.status === 'down' ? 100 : 0) + (m.attention ? 10 : 0) + (m.backup?.lastNightRan ? 0 : 5)
    };
  });
  return (
    <Page title="Madrasahs">
      {rows.length ? <MadrasahList rows={rows} />
        : <NotYet title="No madrasahs yet">Each madrasah is added on the server. Run <code>./madrasah add &lt;name&gt;</code> and it appears here within 5 minutes.</NotYet>}
    </Page>
  );
}
