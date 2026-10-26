'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { audit } from '@/server/audit';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { loginFor } from '@/server/people/logins';
import { makePasswordLink, sendPasswordLink } from '@/server/password-links';

/** Question 14: email a teacher or parent the link to confirm their email and set their own password. */
export async function sendLoginLinkAction(portal: 'teacher' | 'parent', personId: number) {
  const a = await requireAdmin('edit');
  const login = await loginFor(db, portal, personId);
  if (!login) return { error: 'Add an email address first.' };
  if (!login.allowLogin) return { error: 'Their portal access is blocked.' };
  await sendPasswordLink(db, login, a.identityId);
  await audit(db, actorOf(a), { action: `Emailed a set-password link for the ${portal} portal to ${login.email}`, page: portal === 'teacher' ? 'Teachers' : 'Contacts', entity: 'login_identity', entityId: login.id });
  revalidatePath('/admin', 'layout');
  return { message: `Link emailed to ${login.email}.` };
}

/** The same link for the admin to send themselves (WhatsApp, text), for when email isn't set up or doesn't arrive. */
export async function copyLoginLinkAction(portal: 'teacher' | 'parent', personId: number) {
  const a = await requireAdmin('edit');
  const login = await loginFor(db, portal, personId);
  if (!login) return { error: 'Add an email address first.' };
  if (!login.allowLogin) return { error: 'Their portal access is blocked.' };
  const link = (await makePasswordLink(db, login))!;
  await audit(db, actorOf(a), { action: `Made a set-password link for the ${portal} portal for ${login.email}`, page: portal === 'teacher' ? 'Teachers' : 'Contacts', entity: 'login_identity', entityId: login.id });
  revalidatePath('/admin', 'layout');
  return { link };
}
