import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { adminStaff, classAssignment, contact, loginIdentity, smsMessage, smsTemplate, student, studentContact, teacher } from '@/db/schema';
import { zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { decrypt } from '../crypto';
import { LEFT_STATUSES, todayIso, type Actor } from '../people/common';
import { readTab } from '../settings';
import { commonVars, fill } from './templates';

/** "07700 900123" → "+447700900123" with the settings' country code. Null if it isn't a phone number. */
export function normaliseNumber(raw: string, countryCode = '44') {
  const s = raw.trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (s.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+${countryCode}${digits.slice(1)}`;
  return `+${digits}`;
}

/** A WhatsApp link that opens the app (or WhatsApp Web) with the message ready; nothing is sent by us. */
export const whatsappLink = (number: string, text: string, countryCode = '44') => {
  const n = normaliseNumber(number, countryCode);
  return n ? `https://wa.me/${n.slice(1)}?text=${encodeURIComponent(text)}` : null;
};

/** Ready-written WhatsApp messages: a blank greeting plus every SMS template, filled in for this person. */
export async function whatsappMessages(db: DbOrTx, vars: { NAME: string; STUDENT_NAME?: string }) {
  const all = { ...(await commonVars(db)), STUDENT_NAME: '', ...vars };
  return [{ label: 'Greeting', text: `Salaam ${vars.NAME}, ` }, ...(await listSmsTemplates(db)).map((t) => ({ label: `${t.category}: ${t.name}`, text: fill(t.body, all, false) }))];
}

/* ───────── Recipients ───────── */

export const GROUPS = {
  admins: 'Admin staff', teachers: 'Active teachers', currentPrimary: 'Current students’ primary contacts', allContacts: 'All contacts',
  waitingPrimary: 'Waiting-list primary contacts', leftPrimary: 'Left students’ primary contacts', inactivePortal: 'Contacts who haven’t used the parent portal',
  unassigned: 'Contacts not linked to a student', classes: 'Primary contacts in chosen classes', chosen: 'Chosen contacts'
} as const;
export type Group = keyof typeof GROUPS;
export type Recipient = { kind: 'admin' | 'teacher' | 'contact' | 'number'; id: number | null; name: string; number: string };

export async function groupRecipients(db: DbOrTx, group: Group, opts: { classIds?: number[]; contactIds?: number[] } = {}): Promise<Recipient[]> {
  const today = todayIso();
  const primaryOf = (studentWhere: SQL) => db.selectDistinct({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(studentContact)
    .innerJoin(contact, eq(contact.id, studentContact.contactId)).innerJoin(student, eq(student.id, studentContact.studentId)).where(and(eq(studentContact.isPrimary, true), eq(contact.active, true), studentWhere));
  let rows: { id: number; name: string; mobile: string | null }[] = [];
  let kind: Recipient['kind'] = 'contact';
  if (group === 'admins') { kind = 'admin'; rows = await db.select({ id: adminStaff.id, name: adminStaff.name, mobile: adminStaff.mobile }).from(adminStaff).where(isNull(adminStaff.deletedAt)); }
  if (group === 'teachers') { kind = 'teacher'; rows = await db.select({ id: teacher.id, name: teacher.name, mobile: teacher.mobile }).from(teacher).where(and(isNull(teacher.deletedAt), inArray(teacher.status, ['Employed', 'Volunteer']))); }
  if (group === 'currentPrimary') rows = await primaryOf(eq(student.status, 'Current'));
  if (group === 'waitingPrimary') rows = await primaryOf(eq(student.status, 'Waiting List'));
  if (group === 'leftPrimary') rows = await primaryOf(inArray(student.status, [...LEFT_STATUSES]));
  if (group === 'allContacts') rows = await db.select({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(contact).where(eq(contact.active, true));
  if (group === 'unassigned') rows = await db.select({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(contact)
    .where(and(eq(contact.active, true), notExists(db.select({ x: sql`1` }).from(studentContact).where(eq(studentContact.contactId, contact.id)))));
  if (group === 'inactivePortal') rows = await db.select({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(contact)
    .where(and(eq(contact.active, true), notExists(db.select({ x: sql`1` }).from(loginIdentity).where(and(eq(loginIdentity.contactId, contact.id), sql`${loginIdentity.lastLoginAt} is not null`)))));
  if (group === 'classes' && opts.classIds?.length) rows = await db.selectDistinct({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(classAssignment)
    .innerJoin(studentContact, and(eq(studentContact.studentId, classAssignment.studentId), eq(studentContact.isPrimary, true))).innerJoin(contact, eq(contact.id, studentContact.contactId))
    .where(and(inArray(classAssignment.classId, opts.classIds), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today))));
  if (group === 'chosen' && opts.contactIds?.length) rows = await db.select({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(contact).where(inArray(contact.id, opts.contactIds));
  const seen = new Map<string, Recipient>();
  for (const r of rows) if (r.mobile) seen.set(`${kind}:${r.id}`, { kind, id: r.id, name: r.name, number: r.mobile });
  return [...seen.values()];
}

/** CSV upload: one number per row, with an optional name ("number,name" or a heading row with number and name). */
export function csvRecipients(text: string): Recipient[] {
  return text.split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''))).filter(([n]) => n && /\d/.test(n) && !/^number$/i.test(n))
    .slice(0, 5000).map(([number, name]) => ({ kind: 'number' as const, id: null, name: name ?? '', number: number! }));
}

/* ───────── Queue ───────── */

export const sendInput = z.object({ body: z.string().trim().min(1, 'Write the message').max(918, 'Keep it to 918 characters (6 texts)') });

/** Queues one text per recipient. {NAME} and {SCHOOL_NAME} are filled in; numbers are normalised and duplicates dropped. */
export async function queueSms(db: Db, actor: Actor, recipients: Recipient[], raw: unknown) {
  const p = sendInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const cc = String((await readTab(db, 'sms')).countryCode || '44');
  const vars = await commonVars(db);
  const seen = new Set<string>();
  const rows = recipients.flatMap((r) => {
    const n = normaliseNumber(r.number, cc);
    if (!n || seen.has(n)) return [];
    seen.add(n);
    return [{ toNumber: n, recipientKind: r.kind, recipientId: r.id, recipientName: r.name || null, body: fill(p.data.body, { ...vars, NAME: r.name || '' }, false) }];
  });
  if (!rows.length) return { ok: false as const, errors: { body: 'None of the recipients has a mobile number' } };
  const batchId = randomUUID();
  return db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(smsMessage).values(rows.slice(i, i + 1000).map((r) => ({ ...r, batchId, sentBy: actor.identityId })));
    await audit(tx, actor, { action: `Queued ${rows.length === 1 ? '1 text message' : `${rows.length} text messages`}`, page: 'SMS', entity: 'sms_message', details: { batchId } });
    return { ok: true as const, n: rows.length, skipped: recipients.length - rows.length };
  });
}

/* ───────── Drivers ───────── */

type Sent = { providerId: string | null; credits: number | null };
type Driver = { name: string; send: (to: string, body: string, from: string) => Promise<Sent>; balance: () => Promise<number | null> };
/** What the log driver "sent" in this process. Nothing leaves the machine. */
export const smsOutbox: { to: string; body: string }[] = [];

const secret = (v: unknown, env: string) => process.env[env] || ((v as { enc?: string } | undefined)?.enc ? decrypt((v as { enc: string }).enc) : '');

async function driver(db: DbOrTx): Promise<Driver> {
  const s = await readTab(db, 'sms');
  const mode = process.env.SMS_DRIVER ?? 'log';
  // SMS_DRIVER picks the real provider; anything else (the default, "log") never sends.
  if (mode === 'clicksend') {
    const auth = `Basic ${Buffer.from(`${process.env.CLICKSEND_USERNAME || s.clicksendUsername}:${secret(s.clicksendApiKey, 'CLICKSEND_API_KEY')}`).toString('base64')}`;
    return {
      name: 'clicksend',
      send: async (to, body, from) => {
        const r = await fetch('https://rest.clicksend.com/v3/sms/send', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ source: 'madressa', to, body, ...(from ? { from } : {}) }] }) });
        const j = await r.json() as { data?: { messages?: { message_id?: string; message_price?: string; status?: string }[] } };
        const m = j.data?.messages?.[0];
        if (!r.ok || m?.status !== 'SUCCESS') throw new Error(`ClickSend: ${m?.status ?? r.status}`);
        return { providerId: m.message_id ?? null, credits: null };
      },
      balance: async () => { const r = await fetch('https://rest.clicksend.com/v3/account', { headers: { authorization: auth } }); const j = await r.json() as { data?: { balance?: string } }; return j.data?.balance ? Number(j.data.balance) : null; }
    };
  }
  if (mode === 'voodoo') {
    const auth = `Bearer ${secret(s.voodooApiKey, 'VOODOO_API_KEY')}`;
    return {
      name: 'voodoo',
      send: async (to, body, from) => {
        const r = await fetch('https://api.voodoosms.com/sendsms', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ to: to.replace('+', ''), from: from || 'SMS', msg: body }) });
        const j = await r.json() as { messages?: { id?: string }[]; credits?: number; error?: { msg?: string } };
        if (!r.ok) throw new Error(`VoodooSMS: ${j.error?.msg ?? r.status}`);
        return { providerId: j.messages?.[0]?.id ?? null, credits: j.credits ?? null };
      },
      balance: async () => { const r = await fetch('https://api.voodoosms.com/credits', { headers: { authorization: auth } }); const j = await r.json() as { amount?: number }; return j.amount ?? null; }
    };
  }
  return { name: 'log', send: async (to, body) => { smsOutbox.push({ to, body }); console.log(`[sms:log] to=${to} chars=${body.length}`); return { providerId: null, credits: Math.ceil(body.length / 153) || 1 }; }, balance: async () => null };
}

export async function smsBalance(db: DbOrTx) { const d = await driver(db); return { provider: d.name, balance: await d.balance().catch(() => null) }; }

/** Worker step: sends queued texts (oldest first), 50 at a time. */
export async function processSmsQueue(db: Db) {
  const d = await driver(db);
  const from = String((await readTab(db, 'sms')).senderId || '');
  const rows = await db.execute<{ id: number; to_number: string; body: string }>(sql`update sms_message set status = 'sent', sent_at = now()
    where id in (select id from sms_message where status = 'queued' order by id limit 50 for update skip locked) returning id, to_number, body`);
  let sent = 0;
  for (const r of rows) {
    try {
      const out = await d.send(r.to_number, r.body, from);
      await db.update(smsMessage).set({ provider: d.name, providerId: out.providerId, credits: out.credits }).where(eq(smsMessage.id, r.id));
      sent++;
    } catch (e) {
      await db.update(smsMessage).set({ status: 'failed', provider: d.name, error: String((e as Error).message).slice(0, 300), sentAt: null }).where(eq(smsMessage.id, r.id));
    }
  }
  return sent;
}

/* ───────── Logs and templates ───────── */

export type LogFilter = { from?: string; to?: string; staff?: number; kind?: string; q?: string };
export async function smsLogs(db: DbOrTx, f: LogFilter) {
  const conds: (SQL | undefined)[] = [];
  if (f.from) conds.push(gte(smsMessage.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) conds.push(lte(smsMessage.createdAt, new Date(`${f.to}T23:59:59Z`)));
  if (f.staff) conds.push(eq(smsMessage.sentBy, f.staff));
  if (f.kind) conds.push(eq(smsMessage.recipientKind, f.kind));
  if (f.q) conds.push(sql`(lower(coalesce(${smsMessage.recipientName}, '')) like ${`%${f.q.toLowerCase()}%`} or ${smsMessage.toNumber} like ${`%${f.q.replace(/\D/g, '') || f.q}%`} or lower(${smsMessage.body}) like ${`%${f.q.toLowerCase()}%`})`);
  return db.select({ m: smsMessage, staff: adminStaff.name }).from(smsMessage).leftJoin(loginIdentity, eq(loginIdentity.id, smsMessage.sentBy)).leftJoin(adminStaff, eq(adminStaff.id, loginIdentity.adminStaffId))
    .where(and(...conds)).orderBy(desc(smsMessage.id)).limit(1000);
}

export const listSmsTemplates = (db: DbOrTx) => db.select().from(smsTemplate).orderBy(asc(smsTemplate.category), asc(smsTemplate.name));

export const smsTemplateInput = z.object({
  category: z.string().trim().min(1, 'Choose or type a category').max(40), name: z.string().trim().min(1, 'Name the template').max(80), body: z.string().trim().min(1, 'Write the template').max(918)
});
export async function saveSmsTemplate(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = smsTemplateInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  return db.transaction(async (tx) => {
    // System templates keep their key and category; only the wording changes.
    const [cur] = id ? await tx.select().from(smsTemplate).where(eq(smsTemplate.id, id)) : [];
    const values = cur?.systemKey ? { name: p.data.name, body: p.data.body } : p.data;
    const [row] = id ? await tx.update(smsTemplate).set(values).where(eq(smsTemplate.id, id)).returning({ id: smsTemplate.id }) : await tx.insert(smsTemplate).values(p.data).returning({ id: smsTemplate.id });
    if (!row) return { ok: false as const, errors: { name: 'This template no longer exists' } };
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Created'} SMS template “${p.data.name}”`, page: 'SMS templates', entity: 'sms_template', entityId: row.id });
    return { ok: true as const, id: row.id };
  });
}
export async function deleteSmsTemplate(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [t] = await tx.delete(smsTemplate).where(and(eq(smsTemplate.id, id), isNull(smsTemplate.systemKey))).returning();
    if (t) await audit(tx, actor, { action: `Deleted SMS template “${t.name}”`, page: 'SMS templates', entity: 'sms_template', entityId: id });
  });
}
