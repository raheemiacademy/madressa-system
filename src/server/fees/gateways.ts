import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { directDebitMandate, gatewayEvent, PAYMENT_STATUSES, payment } from '@/db/schema';
import { audit } from '../audit';
import { decrypt } from '../crypto';
import { readTab } from '../settings';

type Status = (typeof PAYMENT_STATUSES)[number];
const SYSTEM = { identityId: null, name: 'Payment gateway' };

/** A gateway secret: the environment variable wins, else the encrypted value saved in Settings → Payment gateways. */
export async function gatewaySecret(db: DbOrTx, field: 'stripeWebhookSecret' | 'gocardlessWebhookSecret' | 'stripeSecretKey' | 'gocardlessAccessToken') {
  const env = { stripeWebhookSecret: 'STRIPE_WEBHOOK_SECRET', gocardlessWebhookSecret: 'GOCARDLESS_WEBHOOK_SECRET', stripeSecretKey: 'STRIPE_SECRET_KEY', gocardlessAccessToken: 'GOCARDLESS_ACCESS_TOKEN' }[field];
  if (process.env[env]) return process.env[env]!;
  const v = (await readTab(db, 'gateways'))[field] as { enc?: string } | undefined;
  return v?.enc ? decrypt(v.enc) : null;
}

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Stripe-Signature: "t=…,v1=…". HMAC-SHA256 of "t.body", within 5 minutes. */
export function verifyStripe(body: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const want = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return parts.some(([k, v]) => k === 'v1' && same(v, want));
}

/** GoCardless Webhook-Signature: hex HMAC-SHA256 of the raw body. */
export function verifyGoCardless(body: string, header: string | null, secret: string) {
  return !!header && same(header, createHmac('sha256', secret).update(body).digest('hex'));
}

/** Records an event once. Returns false when it has already been processed (webhooks are retried). */
async function firstTime(tx: DbOrTx, provider: string, eventId: string, type: string) {
  return (await tx.insert(gatewayEvent).values({ provider, eventId, type }).onConflictDoNothing().returning({ id: gatewayEvent.eventId })).length > 0;
}

async function setStatus(tx: DbOrTx, provider: string, gatewayIds: string[], status: Status, note: string) {
  const ids = gatewayIds.filter(Boolean);
  if (!ids.length) return 0;
  const rows = await tx.update(payment).set({ status, updatedAt: new Date() }).where(and(eq(payment.gatewayProvider, provider), inArray(payment.gatewayPaymentId, ids))).returning({ id: payment.id });
  if (rows.length) await audit(tx, SYSTEM, { action: `${note}: ${rows.length === 1 ? '1 payment' : `${rows.length} payments`} set to ${status}`, page: 'Payment gateway', entity: 'payment', details: { ids: rows.map((r) => r.id) } });
  return rows.length;
}

type StripeEvent = { id: string; type: string; data?: { object?: { id?: string; payment_intent?: string | null } } };
const STRIPE: Record<string, Status> = {
  'checkout.session.completed': 'Cleared', 'checkout.session.async_payment_succeeded': 'Cleared', 'payment_intent.succeeded': 'Cleared',
  'checkout.session.async_payment_failed': 'Failed', 'checkout.session.expired': 'Failed', 'payment_intent.payment_failed': 'Failed', 'payment_intent.processing': 'Processing',
  'charge.refunded': 'Reversed', 'charge.dispute.created': 'Reversed'
};

/** Applies one verified Stripe event to the payments it names (by checkout session or payment intent ID). */
export async function handleStripe(db: Db, e: StripeEvent) {
  return db.transaction(async (tx) => {
    if (!(await firstTime(tx, 'stripe', e.id, e.type))) return 'duplicate';
    const status = STRIPE[e.type];
    const o = e.data?.object ?? {};
    if (status) await setStatus(tx, 'stripe', [o.id ?? '', o.payment_intent ?? ''], status, `Stripe ${e.type}`);
    return status ? 'applied' : 'ignored';
  });
}

type GcEvent = { id: string; resource_type: string; action: string; links?: { payment?: string; mandate?: string } };
const GC_PAYMENT: Record<string, Status> = {
  submitted: 'Processing', confirmed: 'Cleared', paid_out: 'Cleared', failed: 'Failed', cancelled: 'Failed',
  customer_approval_denied: 'Failed', charged_back: 'Reversed', late_failure_settled: 'Bounced'
};
const GC_MANDATE: Record<string, string> = {
  created: 'pending_submission', customer_approval_granted: 'pending_submission', submitted: 'submitted', active: 'active', reinstated: 'active', transferred: 'active',
  cancelled: 'cancelled', failed: 'failed', expired: 'expired', blocked: 'blocked', consumed: 'consumed', replaced: 'cancelled'
};

/** Applies a verified GoCardless webhook body (it can carry several events). */
export async function handleGoCardless(db: Db, events: GcEvent[]) {
  let applied = 0;
  for (const e of events) {
    await db.transaction(async (tx) => {
      if (!(await firstTime(tx, 'gocardless', e.id, `${e.resource_type}.${e.action}`))) return;
      if (e.resource_type === 'payments' && GC_PAYMENT[e.action] && e.links?.payment) applied += await setStatus(tx, 'gocardless', [e.links.payment], GC_PAYMENT[e.action]!, `GoCardless payment ${e.action}`);
      if (e.resource_type === 'mandates' && GC_MANDATE[e.action] && e.links?.mandate) {
        await tx.insert(directDebitMandate).values({ provider: 'gocardless', mandateId: e.links.mandate, status: GC_MANDATE[e.action]! })
          .onConflictDoUpdate({ target: [directDebitMandate.provider, directDebitMandate.mandateId], set: { status: GC_MANDATE[e.action]!, updatedAt: new Date() } });
        applied++;
      }
    });
  }
  return applied;
}
