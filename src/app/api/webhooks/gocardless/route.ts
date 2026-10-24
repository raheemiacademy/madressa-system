import { db } from '@/db';
import { gatewaySecret, handleGoCardless, verifyGoCardless } from '@/server/fees/gateways';

export const dynamic = 'force-dynamic';

/** GoCardless webhooks: signature checked against the raw body (498 = invalid token, as GoCardless expects); each event is applied once. */
export async function POST(req: Request) {
  const secret = await gatewaySecret(db, 'gocardlessWebhookSecret');
  if (!secret) return new Response('Not configured', { status: 404 });
  const body = await req.text();
  if (body.length > 1_000_000 || !verifyGoCardless(body, req.headers.get('webhook-signature'), secret)) return new Response('Invalid signature', { status: 498 });
  let events: Parameters<typeof handleGoCardless>[1];
  try { events = JSON.parse(body).events; } catch { return new Response('Bad body', { status: 400 }); }
  if (!Array.isArray(events) || events.some((e) => typeof e?.id !== 'string' || typeof e.resource_type !== 'string' || typeof e.action !== 'string')) return new Response('Bad body', { status: 400 });
  return Response.json({ applied: await handleGoCardless(db, events) });
}
