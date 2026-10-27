import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import webpush from 'web-push';
import type { DbOrTx } from '@/db';
import { loginIdentity, pushQueue, pushSubscription, setting } from '@/db/schema';
import { decrypt, encrypt } from '../crypto';
import { log } from '../ops/logs';

/*
 * Phone notifications (web push) for the parent and teacher apps: new messages, homework, and replies to holiday requests.
 * Like email: callers queue them inside their own transaction, and the worker sends the queue every 15 seconds.
 * PUSH_DRIVER=webpush sends for real; anything else (tests, local) only records them in pushOutbox.
 */

export type PushMessage = { title: string; body: string; url: string };
export type Recipient = { kind: 'contact' | 'teacher'; id: number };

/** What the log driver "sent" in this process (tests read it). Nothing leaves the machine. */
export const pushOutbox: (PushMessage & { identityId: number })[] = [];
const realSending = () => process.env.PUSH_DRIVER === 'webpush';

/**
 * The key pair the push services use to check notifications really come from this school. From VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY if set; otherwise made once and kept in settings, the private half encrypted.
 */
export async function vapidKeys(db: DbOrTx) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const [row] = await db.select().from(setting).where(eq(setting.tab, 'push_keys'));
  const stored = row?.value as { publicKey: string; privateKey: string } | undefined;
  if (stored) return { publicKey: stored.publicKey, privateKey: decrypt(stored.privateKey) };
  const k = webpush.generateVAPIDKeys();
  await db.insert(setting).values({ tab: 'push_keys', value: { publicKey: k.publicKey, privateKey: encrypt(k.privateKey) } }).onConflictDoNothing();
  return vapidKeys(db); // whoever won a race, everyone uses the stored pair
}

/** Saves this browser's subscription for a signed-in parent or teacher (moving it if another login on the device had it). */
export async function savePushSubscription(db: DbOrTx, identityId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  await db.insert(pushSubscription).values({ identityId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { identityId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

export const removePushSubscription = (db: DbOrTx, identityId: number, endpoint: string) =>
  db.delete(pushSubscription).where(and(eq(pushSubscription.identityId, identityId), eq(pushSubscription.endpoint, endpoint)));

/** Queues a notification for these parents and teachers. Only people who turned notifications on, and can sign in, get a row. */
export async function queuePush(db: DbOrTx, to: Recipient[], m: PushMessage) {
  const contacts = to.filter((r) => r.kind === 'contact').map((r) => r.id), teachers = to.filter((r) => r.kind === 'teacher').map((r) => r.id);
  if (!contacts.length && !teachers.length) return 0;
  const ids = await db.select({ id: loginIdentity.id }).from(loginIdentity).where(and(eq(loginIdentity.allowLogin, true),
    or(contacts.length ? and(eq(loginIdentity.portal, 'parent'), inArray(loginIdentity.contactId, contacts)) : sql`false`,
      teachers.length ? and(eq(loginIdentity.portal, 'teacher'), inArray(loginIdentity.teacherId, teachers)) : sql`false`),
    sql`exists (select 1 from push_subscription s where s.identity_id = ${loginIdentity.id})`));
  if (!ids.length) return 0;
  await db.insert(pushQueue).values(ids.map((r) => ({ identityId: r.id, title: m.title.slice(0, 120), body: m.body.slice(0, 240), url: m.url })));
  return ids.length;
}

/** Worker step: sends what's queued to each of the person's devices. A device the push service says has gone is forgotten. */
export async function processPushQueue(db: DbOrTx) {
  const rows = await db.select().from(pushQueue).where(isNull(pushQueue.sentAt)).orderBy(asc(pushQueue.id)).limit(200);
  if (!rows.length) return 0;
  const keys = realSending() ? await vapidKeys(db) : null;
  if (keys) webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.APP_URL || 'mailto:admin@example.org', keys.publicKey, keys.privateKey);
  for (const r of rows) {
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url });
    if (!keys) pushOutbox.push({ identityId: r.identityId, title: r.title, body: r.body, url: r.url });
    else {
      const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.identityId, r.identityId));
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, timeout: 10_000 });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id));
          else await log(db, 'notification', `Phone notification failed (${code ?? 'network'})`, r.identityId);
        }
      }));
    }
    await db.update(pushQueue).set({ sentAt: new Date() }).where(eq(pushQueue.id, r.id));
  }
  return rows.length;
}
