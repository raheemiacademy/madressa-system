'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { cookieName, cookiePath, hitRateLimit } from '@/server/auth';
import { requestMeta } from '@/server/next/actor';
import { ownerAreaOnly, requireOwner } from '@/server/next/owner';
import { setSessionCookie } from '@/server/next/session-cookie';
import {
  changeOwnerPassword, completeOwnerSetup, confirmAuthenticatorReset, type Errors, ownerSignIn, signOutEverywhere, startAuthenticatorReset
} from '@/server/owner/auth';
import { readHealth, runChecks } from '@/server/owner/checks';

const field = (fd: FormData, k: string) => String(fd.get(k) ?? '').slice(0, 200);

export type SignInState = { step: 'password' | 'code'; error?: string } | undefined;

/** Both sign-in screens post here; the second sends the email and password again with the code. */
export async function signInAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  ownerAreaOnly();
  const code = fd.get('step') === 'code' ? field(fd, 'code').replace(/\s/g, '') : null;
  const r = await ownerSignIn(db, field(fd, 'email'), field(fd, 'password'), code, await requestMeta());
  if (!r.ok) return { step: r.field === 'code' ? 'code' : 'password', error: r.error };
  if (!r.token) return { step: 'code' };
  await setSessionCookie('owner', r.token);
  redirect('/owner');
}

export type FormState = { errors?: Errors; error?: string; ok?: string } | undefined;

export async function setupAction(token: string, _prev: FormState, fd: FormData): Promise<FormState> {
  ownerAreaOnly();
  const r = await completeOwnerSetup(db, token, { password: field(fd, 'password'), confirm: field(fd, 'confirm'), code: field(fd, 'code').replace(/\s/g, '') }, await requestMeta());
  if (!r.ok) return { errors: r.errors, error: r.error };
  await setSessionCookie('owner', r.token);
  redirect('/owner');
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const o = await requireOwner();
  const r = await changeOwnerPassword(db, o.identityId, o.token, { current: field(fd, 'current'), next: field(fd, 'next'), repeat: field(fd, 'repeat') });
  return r.ok ? { ok: 'Password changed. Other devices are signed out.' } : { errors: r.errors, error: r.error };
}

export async function startResetAction() {
  const o = await requireOwner();
  return startAuthenticatorReset(db, o.identityId, o.email);
}

export async function confirmResetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const o = await requireOwner();
  const r = await confirmAuthenticatorReset(db, o.identityId, field(fd, 'code').replace(/\s/g, ''));
  return r.ok ? { ok: 'Authenticator reset. Use the new codes from now on.' } : { errors: { code: r.error } };
}

export async function signOutEverywhereAction() {
  const o = await requireOwner();
  await signOutEverywhere(db, o.identityId);
  (await cookies()).delete({ name: cookieName('owner'), path: cookiePath('owner') });
  redirect('/owner/signin');
}

/** "Check now" in the top bar: a round of checks straight away. */
export async function checkNowAction(): Promise<{ ok?: true; error?: string }> {
  await requireOwner();
  if (!(await hitRateLimit(db, 'owner-check-now', { hits: 6, windowMs: 60_000 }))) return { error: 'Checked a moment ago. Try again in a minute.' };
  await runChecks(db, await readHealth());
  revalidatePath('/owner', 'layout');
  return { ok: true };
}
