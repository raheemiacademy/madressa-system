import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import gocardless, { Environments } from 'gocardless-nodejs';
import type { DbOrTx } from '@/db';
import { readTab } from '../settings';
import { gatewaySecret } from './gateways';

/*
 * Stripe Checkout and GoCardless direct debit for the parent portal. Only test/sandbox keys are accepted until the school
 * approves live payments (DECISIONS.md). PAYMENTS_FAKE=1 swaps in fakes so tests call no real service. A fake can't mark anything
 * paid (only a verified webhook does), but it must never be set on a real deployment.
 */

export type CardGateway = {
  checkout(o: { lines: { name: string; amountPence: number }[]; email: string | null; successUrl: string; cancelUrl: string; metadata: Record<string, string> }): Promise<{ id: string; url: string }>;
};
export type DirectDebitGateway = {
  startMandate(o: { email: string | null; name: string; redirectUrl: string; exitUrl: string; metadata: Record<string, string> }): Promise<{ id: string; url: string }>;
  mandateFrom(billingRequestId: string): Promise<string | null>;
  collect(o: { mandateId: string; amountPence: number; description: string; metadata: Record<string, string>; key: string }): Promise<{ id: string }>;
};

const fake = () => process.env.PAYMENTS_FAKE === '1';

/** The card gateway, or null when Stripe is off or has no test key. */
export async function cardGateway(db: DbOrTx): Promise<CardGateway | null> {
  if (!(await readTab(db, 'gateways')).stripeEnabled) return null;
  if (fake()) return { checkout: async () => { const id = `cs_test_fake_${randomUUID()}`; return { id, url: `/parent/fees?checkout=${id}` }; } };
  const key = await gatewaySecret(db, 'stripeSecretKey');
  if (!key?.startsWith('sk_test_')) return null; // live keys stay off until approved
  const stripe = new Stripe(key);
  return {
    async checkout(o) {
      const s = await stripe.checkout.sessions.create({
        mode: 'payment', currency: 'gbp', success_url: o.successUrl, cancel_url: o.cancelUrl, metadata: o.metadata, customer_email: o.email ?? undefined,
        line_items: o.lines.map((l) => ({ quantity: 1, price_data: { currency: 'gbp', unit_amount: l.amountPence, product_data: { name: l.name } } }))
      });
      return { id: s.id, url: s.url! };
    }
  };
}

/** The direct-debit gateway, or null when GoCardless is off or not in sandbox. */
export async function directDebitGateway(db: DbOrTx): Promise<DirectDebitGateway | null> {
  const tab = await readTab(db, 'gateways');
  if (!tab.gocardlessEnabled) return null;
  if (fake()) return {
    startMandate: async () => { const id = `BRQ_FAKE_${randomUUID().slice(0, 8)}`; return { id, url: `/parent/fees/direct-debit/done?billing_request=${id}` }; },
    mandateFrom: async (id) => (id.startsWith('BRQ_FAKE_') ? `MD_FAKE_${id.slice(9)}` : null),
    collect: async () => ({ id: `PM_FAKE_${randomUUID().slice(0, 8)}` })
  };
  const token = await gatewaySecret(db, 'gocardlessAccessToken');
  if (!token || tab.gocardlessEnvironment !== 'sandbox') return null; // live stays off until approved
  const gc = gocardless(token, Environments.Sandbox);
  return {
    async startMandate(o) {
      const br = await gc.billingRequests.create({ mandate_request: { scheme: 'bacs', currency: 'GBP' }, metadata: o.metadata });
      const flow = await gc.billingRequestFlows.create({ redirect_uri: o.redirectUrl, exit_uri: o.exitUrl, links: { billing_request: br.id! }, prefilled_customer: { email: o.email ?? undefined, family_name: o.name } });
      return { id: br.id!, url: flow.authorisation_url! };
    },
    async mandateFrom(id) { return (await gc.billingRequests.find(id)).links?.mandate_request_mandate ?? null; },
    async collect(o) {
      const p = await gc.payments.create({ amount: o.amountPence, currency: 'GBP' as never, description: o.description, metadata: o.metadata, links: { mandate: o.mandateId } }, o.key);
      return { id: p.id! };
    }
  };
}
