import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { formatInstant } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { childIncidents } from '@/server/portal/parent';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Incidents' };
const SEV: Record<string, string> = { Low: 'var(--ra-blue)', Medium: 'var(--color-warn)', High: 'var(--color-bad)', Serious: 'var(--color-bad)' };

/** §9/§20 Incidents the school chose to show on the portal. */
export default async function Incidents({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Incidents');
  const kid = pickKid(p, (await searchParams).child);
  const rows = kid ? await childIncidents(db, kid) : [];
  return (
    <>
      <PortalHead title="Incidents" back="/parent/more" kicker={kid?.label} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/incidents" />
            {!rows.length && <p className="rp-empty">Nothing here.</p>}
            {rows.map((i) => (
              <article key={i.id} className="ra-card" aria-labelledby={`in-${i.id}`} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h2 id={`in-${i.id}`} style={{ margin: 0, fontSize: 16 }}>{i.title}</h2><Chip colour={SEV[i.severity]}>{i.severity}</Chip></div>
                <div className="ra-note">{formatInstant(i.occurredAt, 'EEE d MMM yyyy, HH:mm')}</div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{i.report}</p>
                {i.action && <p style={{ margin: 0 }}><b>Action taken:</b> {i.action}</p>}
              </article>
            ))}
          </>
        )}
      </main>
    </>
  );
}
