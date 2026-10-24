import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { ActionButton, Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { getEvent } from '@/server/learning/events';
import { requireParent } from '@/server/next/portal';
import { childEvents } from '@/server/portal/parent';
import { optInAction, withdrawAction } from '../actions';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Events and trips' };

/** §8/§20 Events: opt in with the consents and choices the event asks for. With auto-invoice, the cost goes on the family's fees. */
export default async function Events({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Events');
  const kid = pickKid(p, (await searchParams).child);
  const evs = kid ? await childEvents(db, kid, p.ctx.year?.id ?? null) : [];
  const details = await Promise.all(evs.map((e) => getEvent(db, e.id)));
  return (
    <>
      <PortalHead title="Events and trips" back="/parent/more" kicker={kid?.label} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/events" />
            {!evs.length && <p className="rp-empty">No upcoming events for {kid.label}.</p>}
            {evs.map((e, i) => {
              const d = details[i]!;
              return (
                <article key={e.id} className="ra-card" aria-labelledby={`ev-${e.id}`} style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <h2 id={`ev-${e.id}`} style={{ margin: 0, fontSize: 17 }}>{e.name}</h2>
                    {e.optIn ? <Chip colour="var(--color-ok)">Opted in</Chip> : !e.open ? <Chip colour="var(--color-fg-muted)">Closed</Chip> : null}
                  </div>
                  <div className="ra-note">{formatCalendarDate(e.date)}{e.time ? `, ${e.time.slice(0, 5)}` : ''}{e.optInDeadline ? ` · opt in by ${formatCalendarDate(e.optInDeadline)}` : ''}{e.paymentDeadline ? ` · pay by ${formatCalendarDate(e.paymentDeadline)}` : ''}</div>
                  {e.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.description}</p>}
                  {e.optIn ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{e.optIn.totalPence ? `${formatPence(e.optIn.totalPence)}${e.optIn.invoiceId ? ', added to your fees' : ''}` : 'No cost'}</span>
                      {e.open && <ActionButton action={withdrawAction.bind(null, e.id, kid.id)} label="Withdraw" confirm={`Withdraw ${kid.label} from ${e.name}?`} />}
                    </div>
                  ) : e.open && (
                    <Form action={optInAction.bind(null, e.id)} submit={`Opt ${kid.label} in`} savebar={false} card={false}>
                      <input type="hidden" name="studentId" value={kid.id} />
                      {d.slots.length > 0 && (
                        <fieldset className="ra-fieldset"><legend>Timeslot</legend><div className="ra-checks">
                          {d.slots.map((s, n) => <label key={s.id} className="ra-check"><input type="radio" name="timeslotId" value={s.id} defaultChecked={n === 0} /> {formatCalendarDate(s.date)}, {s.fromTime.slice(0, 5)} to {s.toTime.slice(0, 5)}</label>)}
                        </div></fieldset>
                      )}
                      {d.prices.length > 0 && (
                        <fieldset className="ra-fieldset"><legend>Costs</legend><div className="ra-checks">
                          {d.prices.map((x) => <label key={x.id} className="ra-check"><input type="checkbox" name="priceIds" value={x.id} defaultChecked={x.required} disabled={x.required} /> {x.description}: {formatPence(x.pricePence)}{x.required ? ' (required)' : ''}</label>)}
                        </div></fieldset>
                      )}
                      {d.consents.length > 0 && (
                        <fieldset className="ra-fieldset"><legend>Consent</legend><div className="ra-checks">
                          {d.consents.map((c) => <label key={c.id} className="ra-check"><input type="checkbox" name="consentIds" value={c.id} /> {c.text}{c.required ? ' (required)' : ''}</label>)}
                        </div></fieldset>
                      )}
                      {e.terms && <p className="ra-note" style={{ whiteSpace: 'pre-wrap' }}>{e.terms}</p>}
                    </Form>
                  )}
                </article>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
