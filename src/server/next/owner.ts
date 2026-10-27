import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { cookieName } from '@/server/auth';
import { ownerEnabled, touchOwnerSession } from '@/server/owner/auth';
import { ownerState, readHealth } from '@/server/owner/checks';
import { sessionFor } from './actor';

export const getOwner = cache(async () => {
  if (!ownerEnabled()) return null;
  const token = (await cookies()).get(cookieName('owner'))?.value;
  const s = await sessionFor('owner');
  if (!s || !token || s.identity.portal !== 'owner') return null;
  await touchOwnerSession(db, token);
  return { identityId: s.identity.id, email: s.identity.email, token };
});
export type OwnerActor = NonNullable<Awaited<ReturnType<typeof getOwner>>>;

/** On a madrasah copy the owner area doesn't exist at all: every /owner address is "not found". */
export function ownerAreaOnly() {
  if (!ownerEnabled()) notFound();
}

/** Every owner page and action calls this first. */
export async function requireOwner(): Promise<OwnerActor> {
  ownerAreaOnly();
  const o = await getOwner();
  if (!o) redirect('/owner/signin');
  return o;
}

/** The dashboard's view of every madrasah and the server, read once per request. */
export const getOwnerState = cache(async () => ownerState(db, await readHealth()));
