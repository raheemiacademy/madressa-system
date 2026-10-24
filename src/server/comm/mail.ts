import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import type { Db, DbOrTx } from '@/db';
import { mailQueue, payment } from '@/db/schema';
import { audit } from '../audit';
import { decrypt } from '../crypto';
import type { Actor } from '../people/common';
import { getProfile } from '../profile';
import { readTab } from '../settings';
import { htmlToPdf } from './pdf';
import { log } from '../ops/logs';

export type NewMail = {
  to: string; toName?: string | null; subject: string; html: string; attachments?: { filename: string; html: string }[];
  fromEmail?: string | null; fromName?: string | null; replyTo?: string | null; cc?: string | null; bcc?: string | null;
  entity?: string; entityId?: number; createdBy?: number | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Puts emails on the §19 mail queue. Addresses that aren't valid are skipped. Returns how many were queued. */
export async function enqueueMail(db: DbOrTx, mails: NewMail[]) {
  const ok = mails.filter((m) => EMAIL.test(m.to.trim()));
  if (!ok.length) return 0;
  const [profile, mailTab] = await Promise.all([getProfile(db), readTab(db, 'mail')]);
  await db.insert(mailQueue).values(ok.map((m) => ({
    toEmail: m.to.trim(), toName: m.toName ?? null, subject: m.subject, html: m.html, attachments: m.attachments ?? [],
    fromEmail: m.fromEmail || (mailTab.sender as string) || profile?.noReplyEmail || null, fromName: m.fromName ?? profile?.name ?? null,
    replyTo: m.replyTo ?? profile?.email ?? null, cc: m.cc ?? null, bcc: m.bcc ?? profile?.bccEmail ?? null,
    entity: m.entity ?? null, entityId: m.entityId ?? null, createdBy: m.createdBy ?? null
  })));
  return ok.length;
}

/* ───────── Drivers ───────── */

type Outgoing = { from: string; to: string; cc?: string; bcc?: string; replyTo?: string; subject: string; html: string; attachments: { filename: string; content: Buffer }[] };
/** What the log driver "sent" in this process (tests read it). Nothing leaves the machine. */
export const logOutbox: Outgoing[] = [];

async function transport(db: DbOrTx) {
  if ((process.env.EMAIL_DRIVER ?? 'log') !== 'smtp') return { send: async (m: Outgoing) => { logOutbox.push(m); console.log(`[mail:log] to=${m.to} subject=${m.subject}`); } };
  const s = await readTab(db, 'mail');
  const priv = s.mode === 'private';
  const pass = priv ? ((s.password as { enc?: string } | undefined)?.enc ? decrypt((s.password as { enc: string }).enc) : '') : process.env.SMTP_PASS ?? '';
  const t = nodemailer.createTransport({
    host: priv ? String(s.host) : process.env.SMTP_HOST, port: priv ? Number(s.port) : Number(process.env.SMTP_PORT ?? 587),
    secure: priv ? s.encryption === 'ssl' : process.env.SMTP_SECURE === 'true', requireTLS: priv ? s.encryption === 'tls' : undefined,
    auth: { user: priv ? String(s.username) : process.env.SMTP_USER ?? '', pass }
  });
  return { send: async (m: Outgoing) => { await t.sendMail(m); } };
}

/* ───────── Sending ───────── */

const address = (email: string | null, name: string | null) => (name ? `"${name.replace(/["\r\n]/g, '')}" <${email}>` : email ?? '');

async function deliver(db: DbOrTx, rows: (typeof mailQueue.$inferSelect)[]) {
  const t = await transport(db);
  let sent = 0;
  for (const m of rows) {
    try {
      const attachments = [];
      for (const a of m.attachments) attachments.push({ filename: a.filename, content: await htmlToPdf(a.html) });
      await t.send({ from: address(m.fromEmail, m.fromName), to: address(m.toEmail, m.toName), cc: m.cc ?? undefined, bcc: m.bcc ?? undefined, replyTo: m.replyTo ?? undefined, subject: m.subject, html: m.html, attachments });
      await db.update(mailQueue).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(mailQueue.id, m.id));
      if (m.entity === 'payment' && m.entityId) await db.update(payment).set({ receiptState: 'sent', receiptSentAt: new Date() }).where(eq(payment.id, m.entityId));
      await log(db, 'notification', `Email sent to ${m.toEmail}: ${m.subject}`, m.createdBy);
      sent++;
    } catch (e) {
      const failed = m.attempts >= 5;
      await db.update(mailQueue).set({ status: failed ? 'failed' : 'queued', lastError: String((e as Error).message ?? e).slice(0, 500), sendAfter: new Date(Date.now() + 2 ** m.attempts * 60_000) }).where(eq(mailQueue.id, m.id));
      await log(db, 'notification', `Email to ${m.toEmail} ${failed ? 'failed' : 'will be retried'}: ${String((e as Error).message ?? e).slice(0, 200)}`, m.createdBy);
    }
  }
  return sent;
}

/**
 * Worker step: claims due emails within the per-minute limit (Settings → Mail) and sends them.
 * A claim pushes send_after 10 minutes on, so an email left "sending" by a crashed worker is retried later.
 */
export async function processMailQueue(db: Db) {
  const perMinute = Number((await readTab(db, 'mail')).perMinute) || 30;
  const [recent] = await db.select({ n: sql<number>`count(*)::int` }).from(mailQueue).where(and(eq(mailQueue.status, 'sent'), gte(mailQueue.sentAt, new Date(Date.now() - 60_000))));
  const room = perMinute - (recent?.n ?? 0);
  if (room <= 0) return 0;
  const rows = await db.execute<typeof mailQueue.$inferSelect>(sql`update mail_queue set status = 'sending', attempts = attempts + 1, send_after = now() + interval '10 minutes'
    where id in (select id from mail_queue where status in ('queued', 'sending') and send_after <= now() order by id limit ${room} for update skip locked)
    returning id, to_email as "toEmail", to_name as "toName", from_email as "fromEmail", from_name as "fromName", reply_to as "replyTo", cc, bcc, subject, html, attachments, attempts, entity, entity_id as "entityId"`);
  return deliver(db, [...rows] as (typeof mailQueue.$inferSelect)[]);
}

/* ───────── §19 Mail Queue Manager ───────── */

export const queueList = (db: DbOrTx, status: (typeof mailQueue.$inferSelect)['status']) =>
  db.select({ id: mailQueue.id, toEmail: mailQueue.toEmail, toName: mailQueue.toName, fromEmail: mailQueue.fromEmail, subject: mailQueue.subject, cc: mailQueue.cc, bcc: mailQueue.bcc,
    attachments: sql<number>`jsonb_array_length(${mailQueue.attachments})`.mapWith(Number), createdAt: mailQueue.createdAt, sentAt: mailQueue.sentAt, attempts: mailQueue.attempts, lastError: mailQueue.lastError })
    .from(mailQueue).where(eq(mailQueue.status, status)).orderBy(desc(mailQueue.id)).limit(500);

export async function sendNow(db: Db, actor: Actor, ids: number[]) {
  if (!ids.length) return 0;
  const rows = await db.update(mailQueue).set({ status: 'sending', attempts: sql`${mailQueue.attempts} + 1`, sendAfter: new Date(Date.now() + 600_000) })
    .where(and(inArray(mailQueue.id, ids), inArray(mailQueue.status, ['queued', 'failed']))).returning();
  const n = await deliver(db, rows);
  await audit(db, actor, { action: `Sent ${n === 1 ? '1 queued email' : `${n} queued emails`} now`, page: 'Mail queue', entity: 'mail_queue', details: { ids } });
  return n;
}

export async function deleteQueued(db: Db, actor: Actor, ids: number[]) {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const gone = await tx.delete(mailQueue).where(and(inArray(mailQueue.id, ids), inArray(mailQueue.status, ['queued', 'failed']))).returning({ id: mailQueue.id });
    if (gone.length) await audit(tx, actor, { action: `Deleted ${gone.length === 1 ? '1 queued email' : `${gone.length} queued emails`}`, page: 'Mail queue', entity: 'mail_queue', details: { ids: gone.map((g) => g.id) } });
    return gone.length;
  });
}
