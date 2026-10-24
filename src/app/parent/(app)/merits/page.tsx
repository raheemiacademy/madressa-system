import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { childMerits } from '@/server/portal/parent';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Merits' };

/** §18/§20 Merits awarded, the balance left to spend in the shop, and certificates. */
export default async function Merits({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Merits');
  const kid = pickKid(p, (await searchParams).child);
  const m = kid ? await childMerits(db, kid) : null;
  return (
    <>
      <PortalHead title="Merits" back="/parent/more" kicker={kid?.label} />
      <main className="rp-main">
        {!kid || !m ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/merits" />
            <div className="rp-tiles">
              <div className="rp-tile"><small>Earned</small><strong>{m.total.points}</strong></div>
              <div className="rp-tile"><small>Left to spend</small><strong>{m.total.balance}</strong></div>
            </div>
            {m.certificates.length > 0 && (
              <>
                <h2>Certificates</h2>
                <ul className="rp-list">
                  {m.certificates.map((c) => <li key={c.id}><a href={`/parent/merits/certificate/${c.id}`}><span className="t">{c.forText}</span><span className="v">PDF</span><span className="m">{formatCalendarDate(c.issuedOn)}</span></a></li>)}
                </ul>
              </>
            )}
            <h2>Awarded</h2>
            {!m.awards.length ? <p className="rp-empty">No merits yet.</p> : (
              <ul className="rp-list">
                {m.awards.map(({ a, name }) => <li key={a.id}><span className="t">{name}</span><span className="v" style={{ color: a.points < 0 ? 'var(--color-bad)' : undefined }}>{a.points > 0 ? `+${a.points}` : a.points}</span><span className="m">{formatCalendarDate(a.awardedOn)} · {a.awardedBy}{a.comment ? ` · ${a.comment}` : ''}</span></li>)}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
