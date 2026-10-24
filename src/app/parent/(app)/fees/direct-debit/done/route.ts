import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireParent } from '@/server/next/portal';
import { finishDirectDebit } from '@/server/portal/fees';

/** GoCardless sends the parent back here once they've authorised the direct debit. */
export async function GET(req: Request) {
  const p = await requireParent('Fees');
  const br = new URL(req.url).searchParams.get('billing_request') ?? new URL(req.url).searchParams.get('billing_request_id') ?? '';
  const r = await finishDirectDebit(db, p.actor, p.ctx, br);
  redirect(`/parent/fees?dd=${r.ok ? 'ok' : 'failed'}`);
}
