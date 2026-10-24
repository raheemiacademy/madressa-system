import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { classTeacher, contact, message, messageParticipant, messageThread, teacher } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { classContacts, routeAllowed, type Party } from '../comm/messages';
import { readTab } from '../settings';

/* §10/§20 Messages as seen from a portal: only conversations this person is on. Sending goes through reply/startFromPortal, which check the §4 routes. */

const TID = sql.raw('"message_thread"."id"');

/** This person's conversations, newest first, with the latest message and whether there's something unread. */
export async function partyInbox(db: DbOrTx, me: Party) {
  const rows = await db.select({
    t: messageThread, lastReadAt: messageParticipant.lastReadAt, unreadOverride: messageParticipant.unreadOverride,
    last: sql<{ name: string; body: string } | null>`(select json_build_object('name', m.sender_name, 'body', left(m.body, 160)) from message m where m.thread_id = ${TID} order by m.id desc limit 1)`,
    newest: sql<string | null>`(select max(m.created_at) from message m where m.thread_id = ${TID} and not (m.sender_kind = ${me.kind} and m.sender_id = ${me.id}))`
  }).from(messageParticipant).innerJoin(messageThread, eq(messageThread.id, messageParticipant.threadId))
    .where(and(eq(messageParticipant.kind, me.kind), eq(messageParticipant.personId, me.id), isNull(messageThread.deletedAt)))
    .orderBy(desc(messageThread.lastMessageAt)).limit(200);
  return rows.map((r) => ({ ...r.t, last: r.last, unread: r.unreadOverride || (!!r.newest && (!r.lastReadAt || new Date(r.newest) > r.lastReadAt)) }));
}
export const partyUnread = async (db: DbOrTx, me: Party) => (await partyInbox(db, me)).filter((t) => t.unread).length;

/** One conversation this person is on (null otherwise). Opening it marks it read. */
export async function partyThread(db: DbOrTx, me: Party, threadId: number) {
  const [row] = await db.select({ t: messageThread }).from(messageParticipant).innerJoin(messageThread, eq(messageThread.id, messageParticipant.threadId))
    .where(and(eq(messageParticipant.threadId, threadId), eq(messageParticipant.kind, me.kind), eq(messageParticipant.personId, me.id), isNull(messageThread.deletedAt)));
  if (!row) return null;
  const msgs = await db.select().from(message).where(eq(message.threadId, threadId)).orderBy(asc(message.id));
  await db.update(messageParticipant).set({ lastReadAt: new Date(), unreadOverride: false })
    .where(and(eq(messageParticipant.threadId, threadId), eq(messageParticipant.kind, me.kind), eq(messageParticipant.personId, me.id)));
  return {
    thread: row.t,
    messages: msgs.map((m) => ({ id: m.id, body: m.body, name: m.senderName, mine: m.senderKind === me.kind && m.senderId === me.id, office: m.senderKind === 'admin', at: formatInstant(m.createdAt, 'dd/MM/yyyy HH:mm'), attachmentFileId: m.attachmentFileId }))
  };
}

/** Who this person may start a conversation with, by the §4 routes: "kind:id" values for the recipient picker. */
export async function recipientsFor(db: DbOrTx, me: Party, classIds: number[]) {
  const out: { value: string; label: string }[] = [];
  if (await routeAllowed(db, me, { kind: 'admin', id: 0 })) out.push({ value: 'admin:0', label: 'The office' });
  if (me.kind === 'contact') {
    const ts = classIds.length ? await db.selectDistinct({ id: teacher.id, name: teacher.name }).from(classTeacher).innerJoin(teacher, eq(teacher.id, classTeacher.teacherId))
      .where(and(inArray(classTeacher.classId, classIds), eq(classTeacher.canMessage, true), isNull(teacher.deletedAt))).orderBy(asc(teacher.name)) : [];
    for (const t of ts) if (await routeAllowed(db, me, { kind: 'teacher', id: t.id })) out.push({ value: `teacher:${t.id}`, label: `${t.name} (teacher)` });
    return out;
  }
  const r = await readTab(db, 'messaging');
  if (r.teachersToTeachers) {
    const ts = await db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(and(isNull(teacher.deletedAt), ne(teacher.id, me.id), inArray(teacher.status, ['Employed', 'Volunteer']))).orderBy(asc(teacher.name));
    out.push(...ts.map((t) => ({ value: `teacher:${t.id}`, label: `${t.name} (teacher)` })));
  }
  if (r.teachersToPrimaryContacts && classIds.length) {
    const ids = await classContacts(db, classIds);
    const cs = ids.length ? await db.select({ id: contact.id, name: contact.name }).from(contact).where(inArray(contact.id, ids)).orderBy(asc(contact.name)) : [];
    out.push(...cs.map((c) => ({ value: `contact:${c.id}`, label: `${c.name} (parent)` })));
  }
  return out;
}

/** Parses a "kind:id" recipient value. */
export function parseRecipient(v: string): Party | null {
  const m = /^(admin|teacher|contact):(\d{1,9})$/.exec(v);
  return m ? { kind: m[1] as Party['kind'], id: Number(m[2]) } : null;
}
