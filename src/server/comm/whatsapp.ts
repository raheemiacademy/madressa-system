import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { contact, incident, smsTemplate, student, studentContact } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { readTab } from '../settings';
import { groupRecipients, listSmsTemplates, normaliseNumber, type Group } from './sms';
import { commonVars, fill } from './templates';

/*
 * WhatsApp in place of texts, for now (FUTURE.md has automatic sending for later). Nothing is sent by the system: staff get
 * a list of people, each with a button that opens WhatsApp with the message already written, and press send themselves.
 */

export type WaPerson = { key: string; name: string; number: string; text: string };

// The groups that make sense for WhatsApp (the SMS "number list" and admin groups are left out).
export const WA_GROUPS: Group[] = ['currentPrimary', 'classes', 'teachers', 'waitingPrimary', 'inactivePortal', 'allContacts'];

/** Each person in the group with a WhatsApp-ready number (digits only) and the message with {NAME} and school details filled in. */
export async function whatsappList(db: DbOrTx, group: Group, body: string, opts: { classIds?: number[] } = {}) {
  const cc = String((await readTab(db, 'sms')).countryCode || '44');
  const vars = await commonVars(db);
  const people = await groupRecipients(db, group, opts);
  const seen = new Set<string>();
  const out: WaPerson[] = [];
  let unusable = 0;
  for (const p of people) {
    const n = normaliseNumber(p.number, cc);
    if (!n) { unusable++; continue; }
    if (seen.has(n)) continue; // one message per number, e.g. parents sharing a phone
    seen.add(n);
    out.push({ key: `${p.kind}:${p.id}`, name: p.name, number: n.slice(1), text: fill(body, { ...vars, NAME: p.name.split(/\s+/)[0] ?? '' }, false) });
  }
  return { people: out.sort((a, b) => a.name.localeCompare(b.name, 'en-GB')), unusable };
}

/** The message templates (the former SMS templates), filled with the school's details, for the "Message" picker. */
export const messageTemplates = listSmsTemplates;

/** After an incident: the student's primary contacts, with the incident message ready to send on WhatsApp. */
export async function incidentWhatsapp(db: DbOrTx, incidentId: number) {
  const [row] = await db.select({ i: incident, s: student }).from(incident).innerJoin(student, eq(student.id, incident.studentId)).where(eq(incident.id, incidentId));
  if (!row) return [];
  const cc = String((await readTab(db, 'sms')).countryCode || '44');
  const [t] = await db.select().from(smsTemplate).where(eq(smsTemplate.systemKey, 'incident'));
  const vars = { ...(await commonVars(db)), STUDENT_NAME: `${row.s.firstName} ${row.s.surname}`, TITLE: row.i.title, WHEN: formatInstant(row.i.occurredAt, 'dd/MM/yyyy HH:mm') };
  const contacts = await db.select({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId))
    .where(and(eq(studentContact.studentId, row.s.id), eq(studentContact.isPrimary, true)));
  return contacts.flatMap((c) => {
    const n = c.mobile ? normaliseNumber(c.mobile, cc) : null;
    return n ? [{ key: `contact:${c.id}`, name: c.name, number: n.slice(1), text: fill(t?.body ?? 'Salaam {NAME}, please contact {SCHOOL_NAME} about {STUDENT_NAME}.', { ...vars, NAME: c.name.split(/\s+/)[0] ?? '' }, false) }] : [];
  });
}
