import { db } from '@/db';
import { CopyButton, HowToPay } from '@/app/_portal/Copy';
import { PortalHead } from '@/app/_portal/Head';
import { Chip } from '@/components/Chip';
import { ActionButton } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { friendlyDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireParent } from '@/server/next/portal';
import { bankTransfer, familyFees, MANDATE_LIVE, payOptions } from '@/server/portal/fees';
import { payByCardAction, payByDirectDebitAction, setUpDirectDebitAction } from '../actions';

export const metadata = { title: 'Fees' };
const MANDATE: Record<string, string> = { pending_submission: 'Being set up', submitted: 'Being set up', active: 'Active', cancelled: 'Cancelled', failed: 'Failed', expired: 'Expired', blocked: 'Blocked', consumed: 'Ended' };

/** §2/§20 Fees (design: ParentFees): what's due, pay by card or direct debit, bank transfer details, and every invoice for the family. */
export default async function Fees({ searchParams }: { searchParams: Promise<{ paid?: string; checkout?: string; setup?: string; dd?: string }> }) {
  const p = await requireParent('Fees');
  const sp = await searchParams;
  const f = await familyFees(db, p.ctx);
  const [opts, bank] = await Promise.all([payOptions(db, p.ctx), bankTransfer(db, p.ctx, f.unpaid.length)]);
  const live = opts.mandate && MANDATE_LIVE.includes(opts.mandate.status);
  const pending = f.unpaid.reduce((s, r) => s + r.pending, 0);
  return (
    <>
      <PortalHead title="Fees" kicker={p.ctx.kids.map((k) => k.label).join(', ')} />
      <main className="rp-main">
        {(sp.paid || sp.checkout) && <div className="ra-banner" role="status" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div>Thank you. Your payment is being confirmed and will show here shortly.{sp.checkout ? ' (Test mode: no money was taken.)' : ''}</div></div>}
        {sp.dd === 'ok' && <div className="ra-banner" role="status" style={{ ['--c' as string]: 'var(--ra-blue)' }}><div>Your direct debit is set up. It takes a few working days to become active.</div></div>}
        {sp.dd === 'failed' && <div className="ra-banner" role="alert" style={{ ['--c' as string]: 'var(--color-bad)' }}><div>The direct debit wasn’t set up. Please try again.</div></div>}
        {opts.mustSetUpDirectDebit && <div className="ra-banner" role="status" style={{ ['--c' as string]: 'var(--ra-violet)' }}><div>The school asks every family to pay by direct debit. Please set one up below.</div></div>}

        <section className="rp-hero" aria-label="To pay">
          <div className="rp-hero-top">
            <div>
              <small>{f.outstanding ? (f.overdue ? 'To pay, including overdue' : 'To pay') : 'All paid'}</small>
              <strong style={{ display: 'block', fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 400, fontSize: 34, lineHeight: 1.2 }}>{formatPence(f.outstanding)}</strong>
              <small>{f.nextDue ? `Next due ${friendlyDate(f.nextDue.dueDate)}` : f.overdue ? `${formatPence(f.overdue)} is overdue` : 'Nothing due'}{pending ? ` · ${formatPence(pending)} being confirmed` : ''}</small>
            </div>
            {/* While card payments are off, the button beside the amount opens the bank details below */}
            {f.outstanding - pending > 0 && !opts.card && bank && <HowToPay target="bank" />}
          </div>
          {f.outstanding - pending > 0 && opts.card && <ActionButton action={payByCardAction} label={`Pay ${formatPence(f.outstanding - pending)} by card`} className="ra-btn tap" />}
        </section>

        {opts.directDebit && (
          <div className="rp-row">
            <span className="rp-ic" style={{ ['--c' as string]: live ? 'var(--ra-blue)' : 'var(--ra-violet)' }}><Icon name={live ? 'check' : 'pound'} /></span>
            <span><b>{live ? `Direct debit: ${MANDATE[opts.mandate!.status]}` : 'Pay by direct debit'}</b>
              <small>{live ? 'Fees are collected automatically when they’re due' : 'Set it up once and fees are collected when they’re due'}</small></span>
            {live ? (f.outstanding - pending > 0 && <ActionButton action={payByDirectDebitAction} label="Pay now" className="ra-btn tap" />) : <ActionButton action={setUpDirectDebitAction} label="Set up" className="ra-btn primary tap" />}
          </div>
        )}

        {bank && (
          <details className="ra-card" id="bank">
            <summary className="tap" style={{ fontWeight: 600, minHeight: 32, cursor: 'pointer' }}>Pay by bank transfer instead</summary>
            <dl className="rp-dl" style={{ margin: '12px 0' }}>
              <dt>Account name</dt><dd>{bank.name || '—'}</dd>
              <dt>Sort code</dt><dd>{bank.sortCode || '—'}</dd>
              <dt>Account no.</dt><dd>{bank.number || '—'}</dd>
              {bank.iban && <><dt>IBAN</dt><dd>{bank.iban}</dd></>}
              <dt>Reference</dt><dd>{bank.reference}</dd>
            </dl>
            <CopyButton text={`Account name: ${bank.name}\nSort code: ${bank.sortCode}\nAccount number: ${bank.number}\nReference: ${bank.reference}`} />
          </details>
        )}

        <h2 id="h-inv">Invoices</h2>
        {!f.invoices.length ? <p className="rp-empty">No invoices yet.</p> : (
          <ul className="rp-list" aria-labelledby="h-inv">
            {f.invoices.map((r) => (
              <li key={r.id}>
                <span className="t">{r.description || r.type}</span>
                <span className="v">{formatPence(r.amountPence)}</span>
                <span className="m">{r.studentName} · #{r.id} · due {friendlyDate(r.dueDate)}{r.received && r.balance > 0 ? ` · ${formatPence(r.received)} paid` : ''}</span>
                <span><Chip>{r.status}</Chip></span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
