import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { ActionButton } from '@/components/Form';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { requireParent } from '@/server/next/portal';
import { childDetails } from '@/server/portal/parent';
import { confirmDetailsAction, walkHomeAction } from '../actions';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Your child’s details' };

/** §20 Confirm student details (each year, when the school asks) and walk-home consent. Changes go to the office as a message. */
export default async function Child({ searchParams }: { searchParams: Promise<{ child?: string; confirm?: string }> }) {
  const p = await requireParent();
  const sp = await searchParams;
  const kid = pickKid(p, sp.child);
  const d = kid ? await childDetails(db, kid, p.ctx.year?.id ?? null) : null;
  const s = d?.student;
  return (
    <>
      <PortalHead title="Your child’s details" back={sp.confirm ? undefined : '/parent/more'} kicker={kid?.label} />
      <main className="rp-main">
        {!kid || !d || !s ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/child" />
            {sp.confirm && !d.confirmedAt && <div className="ra-banner" role="status" style={{ ['--c' as string]: 'var(--ra-violet)' }}><div>Please check {kid.label}’s details and confirm they’re right for this school year.</div></div>}
            <section className="ra-card" aria-label="Details">
              <dl className="rp-dl">
                <dt>Name</dt><dd>{s.firstName} {s.surname}</dd>
                <dt>Date of birth</dt><dd>{s.dob ? formatCalendarDate(s.dob) : '—'}</dd>
                <dt>Class</dt><dd>{kid.className ?? '—'}</dd>
                <dt>Address</dt><dd>{[s.address, s.postcode].filter(Boolean).join(', ') || '—'}</dd>
                <dt>Medical notes</dt><dd>{s.hasMedical ? 'Held by the school' : 'None recorded'}</dd>
              </dl>
            </section>
            <h2>Contacts</h2>
            <ul className="rp-list">{d.contacts.map((c, i) => <li key={i}><span className="t">{c.name}</span><span className="v ra-muted">{c.type}{c.isPrimary ? ' · main' : ''}</span><span className="m">{[c.mobile, c.email].filter(Boolean).join(' · ') || 'No phone or email'}</span></li>)}</ul>
            <div className="ra-card" style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0 }}>{d.confirmedAt ? `Confirmed on ${formatInstant(d.confirmedAt, 'd MMM yyyy')} for this school year.` : 'Not confirmed yet this school year.'} Something wrong? <Link href="/parent/messages/new">Tell the office</Link>.</p>
              <ActionButton action={confirmDetailsAction.bind(null, kid.id)} label={d.confirmedAt ? 'Confirm again' : 'These details are correct'} className="ra-btn primary tap" />
            </div>
            {p.ctx.tab.walkHomeConsent && (
              <div className="ra-card" style={{ display: 'grid', gap: 10 }}>
                <h2 style={{ margin: 0 }}>Walking home</h2>
                <p style={{ margin: 0 }}>{d.walkHome ? `You’ve given consent for ${kid.label} to walk home alone (since ${formatInstant(d.walkHome.givenAt, 'd MMM yyyy')}).` : `${kid.label} isn’t allowed to walk home alone.`}</p>
                <ActionButton action={walkHomeAction.bind(null, kid.id, !d.walkHome)} label={d.walkHome ? 'Withdraw consent' : `Allow ${kid.label} to walk home alone`} confirm={d.walkHome ? undefined : `Allow ${kid.label} to walk home alone after class?`} className="ra-btn tap" />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
