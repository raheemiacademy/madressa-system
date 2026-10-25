import { cookies } from 'next/headers';
import { cookieName, cookiePath, SESSION_TTL_MS, type Portal } from '@/server/auth';

/** Sets a portal's sign-in cookie. Kept out of 'use server' files so it can never be called from the browser. */
export async function setSessionCookie(portal: Portal, token: string) {
  (await cookies()).set(cookieName(portal), token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: cookiePath(portal),
    // Staff cookies end with the browser session; family devices keep theirs. The DB expiry is the real limit.
    ...(portal === 'parent' || portal === 'student' ? { maxAge: SESSION_TTL_MS[portal] / 1000 } : {})
  });
}
