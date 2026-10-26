'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/db';
import { removePushSubscription, savePushSubscription } from '@/server/comm/push';
import { getParent, getTeacher } from '@/server/next/portal';

const subscription = z.object({
  endpoint: z.string().url().startsWith('https://').max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })
});
const who = (portal: 'parent' | 'teacher') => (portal === 'parent' ? getParent() : getTeacher());

/** Turns phone notifications on for the signed-in parent or teacher on this device. */
export async function savePushAction(portal: 'parent' | 'teacher', raw: unknown): Promise<{ error?: string }> {
  const u = await who(portal);
  if (!u) return { error: 'Please sign in again.' };
  const p = subscription.safeParse(raw);
  if (!p.success) return { error: 'This device didn’t give a usable notification address.' };
  await savePushSubscription(db, u.identity.id, p.data, (await headers()).get('user-agent'));
  return {};
}

/** Turns them off again for this device. */
export async function removePushAction(portal: 'parent' | 'teacher', endpoint: string): Promise<void> {
  const u = await who(portal);
  if (u && typeof endpoint === 'string') await removePushSubscription(db, u.identity.id, endpoint.slice(0, 1000));
}
