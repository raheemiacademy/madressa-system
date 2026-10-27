import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { adminStaff, classAssignment, classTeacher, contact, message, messageParticipant, messageThread, PARTY_KINDS, schoolClass, studentContact, teacher } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';
import { appUrl } from '../password-links';
import { readTab } from '../settings';
import { enqueueMail } from './mail';
import { queuePush } from './push';
import { render } from './templates';

export type PartyKind = (typeof PARTY_KINDS)[number];
export type Party = { kind: PartyKind; id: number };

/* ───────── §4 Messaging routes (enforced on the server for every portal sender) ───────── */

/** Classes (current year, current membership) in which a teacher has the Messaging privilege, and the contacts of their students. */
async function teacherReach(db: DbOrTx, teacherId: number) {
  const today = todayIso();
  const rows = await db.select({ contactId: studentContact.contactId, isPrimary: studentContact.isPrimary }).from(classTeacher)
    .innerJoin(schoolClass, eq(schoolClass.id, classTeacher.classId))
    .innerJoin(classAssignment, and(eq(classAssignment.classId, classTeacher.classId), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today))))
    .innerJoin(studentContact, eq(studentContact.studentId, classAssignment.studentId))
    .where(and(eq(classTeacher.teacherId, teacherId), eq(classTeacher.canMessage, true)));
  return rows;
}

/**
 * Is `from` allowed to start or continue a conversation with `to`? Admins may message anyone.
 * Teachers reach primary contacts only of students in classes where they have the Messaging privilege;
 * contacts reach those same teachers (all of them, or same gender only, per the settings).
 */
export async function routeAllowed(db: DbOrTx, from: Party, to: Party): Promise<boolean> {
  if (from.kind === 'admin') return true;
  const r = await readTab(db, 'messaging');
  if (from.kind === 'teacher') {
    if (to.kind === 'admin') return !!r.teachersToAdmins;
    if (to.kind === 'teacher') return !!r.teachersToTeachers && to.id !== from.id;
    return !!r.teachersToPrimaryContacts && (await teacherReach(db, from.id)).some((x) => x.contactId === to.id && x.isPrimary);
  }
  // from contact
  if (to.kind === 'admin') return !!r.contactsToAdmins;
  if (to.kind === 'contact') return false;
  if (!(await teacherReach(db, to.id)).some((x) => x.contactId === from.id)) return false;
  if (r.contactsToTeachersAll) return true;
  if (!r.contactsToTeachersSameGender) return false;
  const [[c], [t]] = await Promise.all([db.select({ g: contact.gender }).from(contact).where(eq(contact.id, from.id)), db.select({ g: teacher.gender }).from(teacher).where(eq(teacher.id, to.id))]);
  return !!c?.g && c.g !== 'Unspecified' && c.g === t?.g;
}

/* ───────── People ───────── */

async function partyInfo(db: DbOrTx, p: Party) {
  if (p.kind === 'admin') { const [a] = await db.select({ name: adminStaff.name, email: adminStaff.email }).from(adminStaff).where(eq(adminStaff.id, p.id)); return a ?? null; }
  if (p.kind === 'teacher') { const [t] = await db.select({ name: teacher.name, email: teacher.email }).from(teacher).where(and(eq(teacher.id, p.id), isNull(teacher.deletedAt))); return t ?? null; }
  const [c] = await db.select({ name: contact.name, email: contact.email }).from(contact).where(eq(contact.id, p.id));
  return c ?? null;
}

/** Primary contacts of the students currently in the chosen classes (compose: "pick a class"). */
export async function classContacts(db: DbOrTx, classIds: number[]) {
  if (!classIds.length) return [];
  const today = todayIso();
  return [...new Set((await db.select({ id: studentContact.contactId }).from(classAssignment)
    .innerJoin(studentContact, and(eq(studentContact.studentId, classAssignment.studentId), eq(studentContact.isPrimary, true)))
    .where(and(inArray(classAssignment.classId, classIds), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today))))).map((r) => r.id))];
}

/* ───────── Sending ───────── */

/** Emails the people a new message is for: the other party, or (for portal senders) the admins it's for, if the preference is on. */
async function notify(db: DbOrTx, threadId: number, from: Party, fromName: string, body: string) {
  const [t] = await db.select().from(messageThread).where(eq(messageThread.id, threadId));
  const people = await db.select().from(messageParticipant).where(eq(messageParticipant.threadId, threadId));
  const targets: { name: string; email: string | null; portal: string }[] = [];
  for (const p of people) {
    if (p.kind === from.kind && p.personId === from.id) continue;
    if (p.kind === 'admin') continue; // admins are handled below, as a group
    const info = await partyInfo(db, { kind: p.kind, id: p.personId });
    if (info) targets.push({ ...info, portal: p.kind === 'teacher' ? 'teacher' : 'parent' });
  }
  if (from.kind !== 'admin' && t?.withOffice && (await readTab(db, 'preferences')).emailOnPortalMessages) {
    const admins = await db.select({ name: adminStaff.name, email: adminStaff.email, rank: adminStaff.rank }).from(adminStaff).where(isNull(adminStaff.deletedAt));
    for (const a of admins.filter((x) => !t.faoRank || x.rank === t.faoRank)) targets.push({ name: a.name, email: a.email, portal: 'admin' });
  }
  // Phone notifications for the parents and teachers on it (admins use the live badges and sound).
  const others = people.filter((p) => !(p.kind === from.kind && p.personId === from.id) && p.kind !== 'admin');
  for (const portal of ['parent', 'teacher'] as const) {
    const kind: 'contact' | 'teacher' = portal === 'parent' ? 'contact' : 'teacher';
    const ids = others.filter((p) => p.kind === kind).map((p) => ({ kind, id: p.personId }));
    if (ids.length) await queuePush(db, ids, { title: `New message from ${fromName}`, body: `${t?.subject ?? ''}: ${body}`.slice(0, 240), url: `/${portal}/messages/${threadId}` });
  }
  for (const x of targets.filter((x) => x.email)) {
    const link = x.portal === 'admin' ? `${appUrl()}/admin/messages/${threadId}` : `${appUrl()}/${x.portal}`;
    const m = await render(db, 'messaging.new-message', { RECIPIENT_NAME: x.name, SENDER_NAME: fromName, SUBJECT: t?.subject ?? '', MESSAGE: body.slice(0, 2000), LINK: link });
    await enqueueMail(db, [{ to: x.email!, toName: x.name, subject: m.subject, html: m.html, entity: 'message_thread', entityId: threadId }]);
  }
}

export const composeInput = z.object({
  teacherIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  staffIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  contactIds: z.array(z.coerce.number().int().positive()).max(5000).default([]),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  faoRank: z.string().trim().max(60).optional().transform((v) => v || null),
  subject: z.string().trim().min(1, 'Add a subject').max(200),
  body: z.string().trim().min(1, 'Write a message').max(10_000),
  lock: z.boolean().default(false)
});

/**
 * §10 Compose (admin). Each recipient gets their own thread, so families never see each other.
 * A class adds the primary contacts of its current students.
 */
export async function compose(db: Db, actor: Actor & { staffId: number }, raw: unknown, attachmentFileId: string | null = null) {
  const p = composeInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  const contactIds = [...new Set([...v.contactIds, ...(await classContacts(db, v.classIds))])];
  const to: Party[] = [...v.teacherIds.map((id) => ({ kind: 'teacher' as const, id })), ...v.staffIds.filter((id) => id !== actor.staffId).map((id) => ({ kind: 'admin' as const, id })), ...contactIds.map((id) => ({ kind: 'contact' as const, id }))];
  if (!to.length) return { ok: false as const, errors: { teacherIds: 'Choose at least one recipient' } };
  const [me] = await db.select({ name: adminStaff.name }).from(adminStaff).where(eq(adminStaff.id, actor.staffId));
  const ids: number[] = [];
  await db.transaction(async (tx) => {
    for (const r of to) {
      if (!(await partyInfo(tx, r))) continue;
      const [t] = await tx.insert(messageThread).values({ subject: v.subject, withOffice: true, faoRank: v.faoRank, locked: v.lock }).returning({ id: messageThread.id });
      await tx.insert(messageParticipant).values([{ threadId: t!.id, kind: 'admin', personId: actor.staffId, lastReadAt: new Date() }, { threadId: t!.id, kind: r.kind, personId: r.id }]).onConflictDoNothing();
      await tx.insert(message).values({ threadId: t!.id, senderKind: 'admin', senderId: actor.staffId, senderName: me?.name ?? actor.name, body: v.body, attachmentFileId });
      await notify(tx, t!.id, { kind: 'admin', id: actor.staffId }, me?.name ?? actor.name, v.body);
      ids.push(t!.id);
    }
    await audit(tx, actor, { action: `Sent “${v.subject}” to ${ids.length === 1 ? '1 recipient' : `${ids.length} recipients`}${v.lock ? ' (locked)' : ''}`, page: 'Messages', entity: 'message_thread', details: { ids } });
  });
  return { ok: true as const, ids };
}

/**
 * A reply on a thread. Portal senders (teachers, contacts) must be on the thread, the thread must be unlocked,
 * and their route must still be allowed. Admins can always reply, and can lock as they reply.
 */
export async function reply(db: Db, from: Party & { name: string }, threadId: number, body: string, opts: { lock?: boolean; attachmentFileId?: string | null; actor?: Actor } = {}) {
  const text = body.trim().slice(0, 10_000);
  if (!text) return { ok: false as const, error: 'Write a message' };
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(messageThread).where(and(eq(messageThread.id, threadId), isNull(messageThread.deletedAt)));
    if (!t) return { ok: false as const, error: 'This conversation no longer exists' };
    const people = await tx.select().from(messageParticipant).where(eq(messageParticipant.threadId, threadId));
    if (from.kind !== 'admin') {
      if (t.locked) return { ok: false as const, error: 'This conversation is locked. Start a new message instead.' };
      if (!people.some((x) => x.kind === from.kind && x.personId === from.id)) return { ok: false as const, error: 'This conversation no longer exists' };
      const others: Party[] = t.withOffice ? [{ kind: 'admin', id: 0 }] : people.filter((x) => !(x.kind === from.kind && x.personId === from.id)).map((x) => ({ kind: x.kind, id: x.personId }));
      for (const o of others) if (!(await routeAllowed(tx, from, o))) return { ok: false as const, error: 'Messages to this person are turned off.' };
    } else if (!t.withOffice) return { ok: false as const, error: 'Admins can read this conversation but not reply to it.' };
    await tx.insert(message).values({ threadId, senderKind: from.kind, senderId: from.id, senderName: from.name, body: text, attachmentFileId: opts.attachmentFileId ?? null });
    await tx.update(messageThread).set({ lastMessageAt: new Date(), ...(from.kind === 'admin' && opts.lock ? { locked: true } : {}) }).where(eq(messageThread.id, threadId));
    await tx.insert(messageParticipant).values({ threadId, kind: from.kind, personId: from.id, lastReadAt: new Date() })
      .onConflictDoUpdate({ target: [messageParticipant.threadId, messageParticipant.kind, messageParticipant.personId], set: { lastReadAt: new Date(), unreadOverride: false } });
    await notify(tx, threadId, from, from.name, text);
    if (opts.actor) await audit(tx, opts.actor, { action: `Replied to “${t.subject}”${opts.lock ? ' and locked it' : ''}`, page: 'Messages', entity: 'message_thread', entityId: threadId });
    return { ok: true as const };
  });
}

/** A portal sender starting a conversation (Phase 8 portals use this): the route must be allowed. */
export async function startFromPortal(db: Db, from: Party & { name: string }, to: Party, subject: string, body: string, faoRank: string | null = null) {
  if (from.kind === 'admin') return { ok: false as const, error: 'Use compose' };
  if (!(await routeAllowed(db, from, to))) return { ok: false as const, error: 'Messages to this person are turned off.' };
  const s = subject.trim().slice(0, 200), b = body.trim().slice(0, 10_000);
  if (!s || !b) return { ok: false as const, error: 'Add a subject and a message' };
  return db.transaction(async (tx) => {
    const office = to.kind === 'admin';
    const [t] = await tx.insert(messageThread).values({ subject: s, withOffice: office, faoRank: office ? faoRank : null }).returning({ id: messageThread.id });
    await tx.insert(messageParticipant).values([{ threadId: t!.id, kind: from.kind, personId: from.id, lastReadAt: new Date() }, ...(office ? [] : [{ threadId: t!.id, kind: to.kind, personId: to.id }])]);
    await tx.insert(message).values({ threadId: t!.id, senderKind: from.kind, senderId: from.id, senderName: from.name, body: b });
    await notify(tx, t!.id, from, from.name, b);
    return { ok: true as const, id: t!.id };
  });
}

/* ───────── Admin inbox ───────── */

export type InboxFilter = { box: 'inbox' | 'locked' | 'other'; who?: 'teachers' | 'contacts' | 'admins'; teacherId?: number; contactId?: number; q?: string };

/** Threads for the admin inbox (office threads for all admins or this admin's rank), Locked, or Other (teacher↔contact oversight). */
export async function inbox(db: DbOrTx, staff: { id: number; rank: string | null; isSuper: boolean }, f: InboxFilter) {
  // Drizzle leaves "id" unqualified inside these subqueries, which Postgres finds ambiguous.
  const TID = sql.raw('"message_thread"."id"');
  const conds: (SQL | undefined)[] = [isNull(messageThread.deletedAt)];
  if (f.box === 'other') conds.push(eq(messageThread.withOffice, false));
  else {
    conds.push(eq(messageThread.withOffice, true), eq(messageThread.locked, f.box === 'locked'));
    if (!staff.isSuper) conds.push(or(isNull(messageThread.faoRank), staff.rank ? eq(messageThread.faoRank, staff.rank) : undefined));
  }
  const has = (kind: PartyKind, id?: number) => sql`exists (select 1 from message_participant p where p.thread_id = ${TID} and p.kind = ${kind}${id ? sql` and p.person_id = ${id}` : sql``}${kind === 'admin' ? sql` and p.person_id <> ${staff.id}` : sql``})`;
  if (f.who === 'teachers') conds.push(has('teacher'));
  if (f.who === 'contacts') conds.push(has('contact'));
  if (f.who === 'admins') conds.push(and(has('admin'), sql`not exists (select 1 from message_participant p where p.thread_id = ${TID} and p.kind <> 'admin')`));
  if (f.teacherId) conds.push(has('teacher', f.teacherId));
  if (f.contactId) conds.push(has('contact', f.contactId));
  if (f.q) conds.push(sql`(lower(${messageThread.subject}) like ${`%${f.q.toLowerCase()}%`} or exists (select 1 from message m where m.thread_id = ${TID} and lower(m.body) like ${`%${f.q.toLowerCase()}%`}))`);
  const rows = await db.select({
    t: messageThread,
    last: sql<{ name: string; body: string; kind: string; at: string } | null>`(select json_build_object('name', m.sender_name, 'body', left(m.body, 160), 'kind', m.sender_kind, 'at', m.created_at) from message m where m.thread_id = ${TID} order by m.id desc limit 1)`,
    others: sql<string | null>`(select string_agg(coalesce(a.name, t.name, c.name), ', ') from message_participant p left join admin_staff a on p.kind = 'admin' and a.id = p.person_id left join teacher t on p.kind = 'teacher' and t.id = p.person_id left join contact c on p.kind = 'contact' and c.id = p.person_id where p.thread_id = ${TID} and not (p.kind = 'admin' and p.person_id = ${staff.id}))`,
    mine: sql<{ lastReadAt: string | null; unreadOverride: boolean } | null>`(select json_build_object('lastReadAt', p.last_read_at, 'unreadOverride', p.unread_override) from message_participant p where p.thread_id = ${TID} and p.kind = 'admin' and p.person_id = ${staff.id})`,
    newest: sql<string | null>`(select max(m.created_at) from message m where m.thread_id = ${TID} and not (m.sender_kind = 'admin' and m.sender_id = ${staff.id}))`,
    newCount: sql<number>`(select count(*)::int from message m where m.thread_id = ${TID} and not (m.sender_kind = 'admin' and m.sender_id = ${staff.id}) and m.created_at > coalesce((select p.last_read_at from message_participant p where p.thread_id = ${TID} and p.kind = 'admin' and p.person_id = ${staff.id}), '-infinity'::timestamptz))`
  }).from(messageThread).where(and(...conds)).orderBy(desc(messageThread.lastMessageAt)).limit(300);
  return rows.map((r) => {
    // Locked threads never show as unread (locking clears them from unread).
    const unread = !r.t.locked && f.box !== 'other' && (!!r.mine?.unreadOverride || (!!r.newest && (!r.mine?.lastReadAt || new Date(r.newest) > new Date(r.mine.lastReadAt))));
    // How many messages are new to this person (a thread marked unread by hand counts as 1).
    return { ...r.t, last: r.last, others: r.others ?? '', unread, unreadCount: unread ? Math.max(1, r.newCount) : 0 };
  });
}

export const unreadCount = async (db: DbOrTx, staff: { id: number; rank: string | null; isSuper: boolean }) => (await inbox(db, staff, { box: 'inbox' })).filter((t) => t.unread).length;

/** One thread with its messages and, for each message, whether the other people on it have read it yet. Opening it marks it read. */
export async function openThread(db: DbOrTx, staffId: number, threadId: number) {
  const [t] = await db.select().from(messageThread).where(and(eq(messageThread.id, threadId), isNull(messageThread.deletedAt)));
  if (!t) return null;
  const [msgs, people] = await Promise.all([db.select().from(message).where(eq(message.threadId, threadId)).orderBy(asc(message.id)), db.select().from(messageParticipant).where(eq(messageParticipant.threadId, threadId))]);
  const names = await Promise.all(people.map(async (p) => ({ ...p, name: (await partyInfo(db, { kind: p.kind, id: p.personId }))?.name ?? 'Removed' })));
  if (t.withOffice) await db.insert(messageParticipant).values({ threadId, kind: 'admin', personId: staffId, lastReadAt: new Date() })
    .onConflictDoUpdate({ target: [messageParticipant.threadId, messageParticipant.kind, messageParticipant.personId], set: { lastReadAt: new Date(), unreadOverride: false } });
  return {
    thread: t, people: names,
    messages: msgs.map((m) => {
      const readers = names.filter((p) => !(p.kind === m.senderKind && p.personId === m.senderId) && (m.senderKind !== 'admin' || p.kind !== 'admin'));
      return { ...m, at: formatInstant(m.createdAt, 'dd/MM/yyyy HH:mm'), readBy: readers.filter((p) => p.lastReadAt && p.lastReadAt >= m.createdAt).map((p) => p.name), notReadBy: readers.filter((p) => !p.lastReadAt || p.lastReadAt < m.createdAt).map((p) => p.name) };
    })
  };
}

/** §10 bulk: mark read or unread, archive (lock), unlock, or delete. */
export async function bulkThreads(db: Db, actor: Actor & { staffId: number }, ids: number[], op: 'read' | 'unread' | 'lock' | 'unlock' | 'delete') {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    if (op === 'read' || op === 'unread') {
      for (const threadId of ids) await tx.insert(messageParticipant).values({ threadId, kind: 'admin', personId: actor.staffId, lastReadAt: op === 'read' ? new Date() : null, unreadOverride: op === 'unread' })
        .onConflictDoUpdate({ target: [messageParticipant.threadId, messageParticipant.kind, messageParticipant.personId], set: op === 'read' ? { lastReadAt: new Date(), unreadOverride: false } : { unreadOverride: true } });
      return ids.length;
    }
    const set = op === 'delete' ? { deletedAt: new Date() } : { locked: op === 'lock' };
    const rows = await tx.update(messageThread).set(set).where(and(inArray(messageThread.id, ids), isNull(messageThread.deletedAt))).returning({ id: messageThread.id });
    await audit(tx, actor, { action: `${op === 'delete' ? 'Deleted' : op === 'lock' ? 'Locked' : 'Unlocked'} ${rows.length === 1 ? '1 conversation' : `${rows.length} conversations`}`, page: 'Messages', entity: 'message_thread', details: { ids: rows.map((r) => r.id) } });
    return rows.length;
  });
}

export const deleteRangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date'), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date'),
  person: z.string().regex(/^(teacher|contact|admin):\d+$/, 'Choose a sender or recipient')
}).refine((v) => v.to >= v.from, { path: ['to'], message: 'The end date can’t be before the start' });

/** §10 "Delete several messages by date range and sender or recipient". Conversations left empty go too. */
export async function deleteRange(db: Db, actor: Actor, raw: unknown) {
  const p = deleteRangeInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [kind, idStr] = p.data.person.split(':') as [PartyKind, string];
  const id = Number(idStr);
  return db.transaction(async (tx) => {
    const gone = await tx.execute(sql`delete from message m using message_thread t where t.id = m.thread_id
      and m.created_at >= ${p.data.from}::date and m.created_at < (${p.data.to}::date + 1)
      and ((m.sender_kind = ${kind} and m.sender_id = ${id}) or exists (select 1 from message_participant x where x.thread_id = m.thread_id and x.kind = ${kind} and x.person_id = ${id}))
      returning m.id`);
    await tx.execute(sql`update message_thread t set deleted_at = now() where t.deleted_at is null and not exists (select 1 from message m where m.thread_id = t.id)`);
    await audit(tx, actor, { action: `Deleted ${gone.length === 1 ? '1 message' : `${gone.length} messages`} (${p.data.from} to ${p.data.to}, ${kind} #${id})`, page: 'Messages', entity: 'message' });
    return { ok: true as const, n: gone.length };
  });
}

/** Admins: delete one message (it's gone for everyone). A conversation left with no messages is deleted too. Audited. */
export async function deleteMessage(db: Db, actor: Actor, messageId: number) {
  return db.transaction(async (tx) => {
    const [m] = await tx.delete(message).where(eq(message.id, messageId)).returning({ threadId: message.threadId, sender: message.senderName });
    if (!m) return false;
    const [left] = await tx.select({ n: sql<number>`count(*)::int` }).from(message).where(eq(message.threadId, m.threadId));
    if (!left?.n) await tx.update(messageThread).set({ deletedAt: new Date() }).where(eq(messageThread.id, m.threadId));
    await audit(tx, actor, { action: `Deleted a message from ${m.sender}`, page: 'Messages', entity: 'message', entityId: messageId, details: { threadId: m.threadId } });
    return true;
  });
}

/** How many messages teachers have sent parents (conversations without the office) since this admin last looked at them. */
export async function teacherParentNew(db: DbOrTx, staffId: number) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(message).innerJoin(messageThread, eq(messageThread.id, message.threadId))
    .where(and(eq(messageThread.withOffice, false), isNull(messageThread.deletedAt), eq(message.senderKind, 'teacher'),
      sql`${message.createdAt} > coalesce((select seen_teacher_parent_at from admin_staff where id = ${staffId}), (select created_at from admin_staff where id = ${staffId}))`));
  return r?.n ?? 0;
}

export const markTeacherParentSeen = (db: DbOrTx, staffId: number) => db.update(adminStaff).set({ seenTeacherParentAt: new Date() }).where(eq(adminStaff.id, staffId));
