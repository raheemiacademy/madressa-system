'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { cookieName, cookiePath, invalidateSession, login, PORTALS, SESSION_TTL_MS, type Portal } from '@/server/auth';
import { requestMeta } from '@/server/next/actor';
import { safeNext } from '@/lib/safe-next';

export type LoginState = { error?: string; email?: string } | undefined;

export async function loginAction(portal: Portal, _prev: LoginState, fd: FormData): Promise<LoginState> {
  if (!PORTALS.includes(portal)) return { error: 'Unknown portal' };
  const email = String(fd.get('email') ?? '').slice(0, 200);
  const res = await login(db, portal, email, String(fd.get('password') ?? '').slice(0, 200), await requestMeta());
  if (!res.ok) return { error: res.error, email };
  (await cookies()).set(cookieName(portal), res.token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: cookiePath(portal),
    // Staff cookies end with the browser session; family devices keep theirs. The DB expiry is the real limit.
    ...(portal === 'parent' || portal === 'student' ? { maxAge: SESSION_TTL_MS[portal] / 1000 } : {})
  });
  redirect(safeNext(portal, fd.get('next')));
}

export async function logoutAction(portal: Portal) {
  if (!PORTALS.includes(portal)) return;
  const jar = await cookies();
  await invalidateSession(db, jar.get(cookieName(portal))?.value);
  jar.delete({ name: cookieName(portal), path: cookiePath(portal) });
  redirect(`/${portal}/login`);
}
