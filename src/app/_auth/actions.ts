'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { cookieName, cookiePath, invalidateSession, login, PORTALS, type Portal } from '@/server/auth';
import { setSessionCookie } from '@/server/next/session-cookie';
import { requestMeta, sessionFor } from '@/server/next/actor';
import { changeOwnPassword, isLinkPortal, requestPasswordLink, sendPasswordLink, redeemPasswordLink } from '@/server/password-links';
import { loginIdentity } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { safeNext } from '@/lib/safe-next';
import { setUpSchool } from '@/server/onboarding';

export type LoginState = { error?: string; notice?: string; email?: string } | undefined;
const LINK_SENT = 'Check your email: we’ve sent you a link to set your password. It expires in 48 hours.';

export async function loginAction(portal: Portal, _prev: LoginState, fd: FormData): Promise<LoginState> {
  if (!PORTALS.includes(portal)) return { error: 'Unknown portal' };
  const email = String(fd.get('email') ?? '').slice(0, 200);
  const res = await login(db, portal, email, String(fd.get('password') ?? '').slice(0, 200), await requestMeta());
  if (!res.ok) {
    // First sign-in for an invited teacher or parent: email them the link to choose a password.
    if (res.noPasswordYet) {
      const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.id, res.noPasswordYet)).limit(1);
      if (idn) await sendPasswordLink(db, idn);
      return { notice: LINK_SENT, email };
    }
    return { error: res.error, email };
  }
  await setSessionCookie(portal, res.token);
  redirect(res.mustChangePassword && isLinkPortal(portal) ? `/${portal}/change-password` : safeNext(portal, fd.get('next')));
}

export async function logoutAction(portal: Portal) {
  if (!PORTALS.includes(portal)) return;
  const jar = await cookies();
  await invalidateSession(db, jar.get(cookieName(portal))?.value);
  jar.delete({ name: cookieName(portal), path: cookiePath(portal) });
  redirect(`/${portal}/login`);
}

/** "First time here, or forgotten your password?" The answer is the same whether or not the email has an account. */
export async function requestLinkAction(portal: Portal, _prev: LoginState, fd: FormData): Promise<LoginState> {
  if (!isLinkPortal(portal)) return { error: 'Unknown portal' };
  const email = String(fd.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter your email address.', email };
  await requestPasswordLink(db, portal, email);
  return { notice: 'If that email has an account here, we’ve sent it a link to set your password. It expires in 48 hours.', email };
}

export async function setPasswordAction(portal: Portal, token: string, _prev: LoginState, fd: FormData): Promise<LoginState> {
  if (!isLinkPortal(portal)) return { error: 'Unknown portal' };
  const password = String(fd.get('password') ?? ''), confirm = String(fd.get('confirm') ?? '');
  if (password !== confirm) return { error: 'The two passwords don’t match.' };
  const r = await redeemPasswordLink(db, portal, token, password, await requestMeta());
  if (!r.ok) return { error: r.error };
  await setSessionCookie(portal, r.token);
  redirect(`/${portal}`);
}

export async function changePasswordAction(portal: Portal, _prev: LoginState, fd: FormData): Promise<LoginState> {
  if (!isLinkPortal(portal)) return { error: 'Unknown portal' };
  const s = await sessionFor(portal);
  if (!s) redirect(`/${portal}/login`);
  const r = await changeOwnPassword(db, s.identity.id, String(fd.get('password') ?? ''), String(fd.get('confirm') ?? ''));
  if (!r.ok) return { error: r.error };
  redirect(`/${portal}`);
}

export type SetupState = { error?: string; errors?: Record<string, string>; values?: Record<string, string> } | undefined;

/** First-time setup of a new madrasah: creates the school and its first admin, signs them in, and opens the dashboard with the welcome. */
export async function setupAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  const raw = Object.fromEntries(['code', 'school', 'name', 'email', 'password'].map((k) => [k, String(fd.get(k) ?? '')]));
  const res = await setUpSchool(db, raw, await requestMeta());
  const { password: _pw, code: _code, ...values } = raw;
  if (!res.ok) return { error: 'error' in res ? res.error : undefined, errors: 'errors' in res ? res.errors : undefined, values };
  await setSessionCookie('admin', res.token);
  redirect('/admin?welcome=1');
}
