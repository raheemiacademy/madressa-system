import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { adminStaff, contact, INCIDENT_SEVERITIES, incident, incidentTemplate, schoolClass, smsTemplate, student, studentContact, teacher } from '@/db/schema';
import { formatInstant, ukLocal } from '@/lib/dates';
import { optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { enqueueMail } from '../comm/mail';
import { primaryContacts } from '../comm/notify';
import { queueSms } from '../comm/sms';
import { render } from '../comm/templates';
import type { Actor } from '../people/common';

const checkbox = z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on');

export const incidentInput = z.object({
  kind: z.enum(['student', 'teacher', 'staff']),
  studentId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  classId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  teacherId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  staffId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  severity: z.enum(INCIDENT_SEVERITIES),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter the date and time'),
  title: z.string().trim().min(1, 'Add a title').max(200),
  report: z.string().trim().min(1, 'Describe what happened').max(10_000),
  action: optionalText(5000),
  inEoty: checkbox, onPortal: checkbox, emailContacts: checkbox, smsContacts: checkbox
}).refine((v) => v.kind !== 'student' || v.studentId, { path: ['studentId'], message: 'Choose the student' })
  .refine((v) => v.kind !== 'teacher' || v.teacherId, { path: ['teacherId'], message: 'Choose the teacher' })
  .refine((v) => v.kind !== 'staff' || v.staffId, { path: ['staffId'], message: 'Choose the staff member' })
  .refine((v) => ukLocal(v.occurredAt) <= new Date(), { path: ['occurredAt'], message: 'The incident can’t be in the future' });

/** §9 Add incident. For a student, it can email and/or text their primary contacts. */
export async function saveIncident(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = incidentInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const { emailContacts, smsContacts, occurredAt, ...v } = p.data;
  const values = {
    ...v, occurredAt: ukLocal(occurredAt),
    studentId: v.kind === 'student' ? v.studentId : null, classId: v.kind === 'student' ? v.classId : null,
    teacherId: v.kind === 'teacher' ? v.teacherId : null, staffId: v.kind === 'staff' ? v.staffId : null
  };
  const r = await db.transaction(async (tx) => {
    const [row] = id ? await tx.update(incident).set(values).where(eq(incident.id, id)).returning() : await tx.insert(incident).values({ ...values, createdBy: actor.identityId }).returning();
    if (!row) return null;
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Recorded'} ${v.severity.toLowerCase()} incident “${v.title}”`, page: 'Incidents', entity: 'incident', entityId: row.id });
    return row;
  });
  if (!r) return { ok: false as const, errors: { title: 'This incident no longer exists' } };
  let emailed = 0, texted = 0;
  if (r.studentId && (emailContacts || smsContacts)) {
    const [s] = await db.select().from(student).where(eq(student.id, r.studentId));
    const contacts = await primaryContacts(db, [r.studentId]);
    if (emailContacts && s) for (const c of contacts.filter((x) => x.email)) {
      const m = await render(db, 'incidents.notify', { CONTACT_NAME: c.name, STUDENT_NAME: `${s.firstName} ${s.surname}`, TITLE: r.title, SEVERITY: r.severity, WHEN: formatInstant(r.occurredAt, 'dd/MM/yyyy HH:mm'), REPORT: r.report, ACTION: r.action ?? '—' });
      emailed += await enqueueMail(db, [{ to: c.email!, toName: c.name, subject: m.subject, html: m.html, entity: 'incident', entityId: r.id, createdBy: actor.identityId }]);
    }
    if (smsContacts && s) {
      const [t] = await db.select().from(smsTemplate).where(eq(smsTemplate.systemKey, 'incident'));
      const mobiles = await db.select({ id: contact.id, name: contact.name, mobile: contact.mobile }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId))
        .where(and(eq(studentContact.studentId, r.studentId), eq(studentContact.isPrimary, true)));
      const q = await queueSms(db, actor, mobiles.filter((m) => m.mobile).map((m) => ({ kind: 'contact' as const, id: m.id, name: m.name, number: m.mobile! })), { body: (t?.body ?? '{SCHOOL_NAME}: please contact the office about {STUDENT_NAME}.').replace('{STUDENT_NAME}', `${s.firstName} ${s.surname}`) });
      texted = q.ok ? q.n : 0;
    }
    await db.update(incident).set({ emailed: r.emailed || emailed > 0, texted: r.texted || texted > 0 }).where(eq(incident.id, r.id));
  }
  return { ok: true as const, id: r.id, emailed, texted };
}

export type IncidentFilter = { kind?: 'student' | 'teacher' | 'staff'; studentId?: number; classId?: number; from?: string; to?: string };
const who = sql<string>`coalesce(${student.firstName} || ' ' || ${student.surname}, ${teacher.name}, ${adminStaff.name})`;

export function listIncidents(db: DbOrTx, f: IncidentFilter = {}, limit = 500) {
  const conds: (SQL | undefined)[] = [f.kind ? eq(incident.kind, f.kind) : undefined, f.studentId ? eq(incident.studentId, f.studentId) : undefined, f.classId ? eq(incident.classId, f.classId) : undefined,
    f.from ? gte(incident.occurredAt, ukLocal(`${f.from}T00:00`)) : undefined, f.to ? lte(incident.occurredAt, ukLocal(`${f.to}T23:59`)) : undefined];
  return db.select({ i: incident, who, className: schoolClass.name }).from(incident).leftJoin(student, eq(student.id, incident.studentId)).leftJoin(teacher, eq(teacher.id, incident.teacherId))
    .leftJoin(adminStaff, eq(adminStaff.id, incident.staffId)).leftJoin(schoolClass, eq(schoolClass.id, incident.classId)).where(and(...conds)).orderBy(desc(incident.occurredAt)).limit(limit);
}

export async function incidentCounts(db: DbOrTx) {
  const rows = await db.select({ kind: incident.kind, n: sql<number>`count(*)`.mapWith(Number) }).from(incident).groupBy(incident.kind);
  return { student: rows.find((r) => r.kind === 'student')?.n ?? 0, teacher: rows.find((r) => r.kind === 'teacher')?.n ?? 0, staff: rows.find((r) => r.kind === 'staff')?.n ?? 0 };
}

/** §9 Health & Safety: incidents per month for the last 12 months, by severity. */
export async function twelveMonths(db: DbOrTx, today: string) {
  const from = `${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}-01`;
  const rows = await db.select({ month: sql<string>`to_char(${incident.occurredAt} at time zone 'Europe/London', 'YYYY-MM')`, severity: incident.severity, n: sql<number>`count(*)`.mapWith(Number) })
    .from(incident).where(gte(incident.occurredAt, new Date(`${from}T00:00:00Z`))).groupBy(sql`1`, incident.severity);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12 + i, 1)); return d.toISOString().slice(0, 7); });
  return months.map((m) => ({ month: m, ...Object.fromEntries(INCIDENT_SEVERITIES.map((s) => [s, rows.find((r) => r.month === m && r.severity === s)?.n ?? 0])), total: rows.filter((r) => r.month === m).reduce((t, r) => t + r.n, 0) }));
}

export async function deleteIncident(db: Db, actor: Actor, id: number) {
  const [i] = await db.delete(incident).where(eq(incident.id, id)).returning();
  if (i) await audit(db, actor, { action: `Deleted incident “${i.title}”`, page: 'Incidents', entity: 'incident', entityId: id });
}

export const listIncidentTemplates = (db: DbOrTx) => db.select().from(incidentTemplate).orderBy(asc(incidentTemplate.name));
export const templateInput = z.object({
  name: z.string().trim().min(1, 'Name the template').max(80), severity: z.enum(INCIDENT_SEVERITIES),
  title: z.string().trim().max(200).default(''), report: z.string().trim().max(10_000).default(''), action: z.string().trim().max(5000).default(''),
  inEoty: checkbox, onPortal: checkbox
});
export async function saveIncidentTemplate(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = templateInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(incidentTemplate).set(p.data).where(eq(incidentTemplate.id, id)).returning() : await db.insert(incidentTemplate).values(p.data).returning();
  await audit(db, actor, { action: `Saved incident template “${p.data.name}”`, page: 'Incidents', entity: 'incident_template', entityId: row?.id });
  return { ok: true as const };
}
export async function deleteIncidentTemplate(db: Db, actor: Actor, id: number) {
  const [t] = await db.delete(incidentTemplate).where(eq(incidentTemplate.id, id)).returning();
  if (t) await audit(db, actor, { action: `Deleted incident template “${t.name}”`, page: 'Incidents', entity: 'incident_template', entityId: id });
}
