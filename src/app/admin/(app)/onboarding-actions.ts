'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { hideChecklist, invitePortalUsers, skipStep } from '@/server/onboarding';

/* The "Set up your madrasah" checklist. Setting up is a Super admin's job. */

export async function skipStepAction(key: string, skip: boolean) {
  const a = await requireAdmin('super');
  await skipStep(db, actorOf(a), key, skip);
  revalidatePath('/admin');
}

export async function hideChecklistAction(hide: boolean) {
  await requireAdmin('super');
  await hideChecklist(db, hide);
  revalidatePath('/admin', 'layout');
}

export async function inviteAction(): Promise<{ error?: string; message?: string }> {
  const a = await requireAdmin('super');
  const r = await invitePortalUsers(db, actorOf(a));
  revalidatePath('/admin', 'layout');
  return { message: `Done: ${r.created === 1 ? '1 new login' : `${r.created} new logins`}, and ${r.emailed === 1 ? '1 email' : `${r.emailed} emails`} with a link to choose a password.${r.skipped ? ` ${r.skipped} skipped because their email is already used by someone else.` : ''}` };
}
