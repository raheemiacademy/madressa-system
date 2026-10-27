'use server';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';
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
import { evaluateAlerts, saveAlertSettings } from '@/server/owner/alerts';
import { removePushSubscription, savePushSubscription } from '@/server/comm/push';
import { ownerState, readHealth, runChecks } from '@/server/owner/checks';
import { setLeadNotes, setLeadStatus } from '@/server/owner/leads';

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
  const health = await readHealth();
  await runChecks(db, health);
  await evaluateAlerts(db, await ownerState(db, health));
  revalidatePath('/owner', 'layout');
  return { ok: true };
}

const leadId = (id: unknown) => (Number.isInteger(id) && (id as number) > 0 ? (id as number) : 0);

/** Leads: the status picker. */
export async function setLeadStatusAction(id: number, status: string) {
  const o = await requireOwner();
  const r = await setLeadStatus(db, { identityId: o.identityId, name: 'Owner' }, leadId(id), status);
  if (r.ok) revalidatePath('/owner', 'layout');
  return r;
}

/** Leads: the notes box, saved as you type (after a pause) and when you leave it. */
export async function setLeadNotesAction(id: number, notes: string) {
  const o = await requireOwner();
  return setLeadNotes(db, { identityId: o.identityId, name: 'Owner' }, leadId(id), notes);
}

const subscription = z.object({
  endpoint: z.string().url().startsWith('https://').max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })
});

/** Alerts → "Push on this device": saves this browser's push address for the owner. */
export async function saveOwnerPushAction(raw: unknown): Promise<{ error?: string }> {
  const o = await requireOwner();
  const p = subscription.safeParse(raw);
  if (!p.success) return { error: 'This device didn’t give a usable notification address.' };
  await savePushSubscription(db, o.identityId, p.data, (await headers()).get('user-agent'));
  return {};
}

export async function removeOwnerPushAction(endpoint: string) {
  const o = await requireOwner();
  if (typeof endpoint === 'string') await removePushSubscription(db, o.identityId, endpoint.slice(0, 1000));
}

/** Alerts → which alerts to send, and where to email them. */
export async function saveAlertSettingsAction(raw: unknown) {
  const o = await requireOwner();
  return saveAlertSettings(db, { identityId: o.identityId, name: 'Owner' }, raw);
}
