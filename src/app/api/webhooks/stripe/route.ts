import { db } from '@/db';
import { gatewaySecret, handleStripe, verifyStripe } from '@/server/fees/gateways';

export const dynamic = 'force-dynamic';

/** Stripe webhooks: signature checked against the raw body; each event is applied once. */
export async function POST(req: Request) {
  const secret = await gatewaySecret(db, 'stripeWebhookSecret');
  if (!secret) return new Response('Not configured', { status: 404 });
  const body = await req.text();
  if (body.length > 1_000_000 || !verifyStripe(body, req.headers.get('stripe-signature'), secret)) return new Response('Bad signature', { status: 400 });
  let event: Parameters<typeof handleStripe>[1];
  try { event = JSON.parse(body); } catch { return new Response('Bad body', { status: 400 }); }
  if (typeof event?.id !== 'string' || typeof event.type !== 'string') return new Response('Bad body', { status: 400 });
  return Response.json({ result: await handleStripe(db, event) });
}
