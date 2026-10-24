import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import {
  attendanceMark, classAssignment, CONTACT_TYPES, contact, GENDERS, registerSession, schoolClass, STUDENT_STATUSES, student, studentContact, yearGroup
} from '@/db/schema';
import { checkbox, isoDate, optionalIsoDate, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import { decrypt, encrypt } from '../crypto';
import { ageOn, catchFieldFail, FieldFail, isLeftStatus, optEmail, todayIso, type Actor } from './common';
import { answersFromForm, listFields, saveAnswers } from './custom-fields';
import { syncPortalLogin } from './logins';

export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const studentInput = z.object({
  firstName: z.string().trim().min(1, 'Add a first name').max(80),
  surname: z.string().trim().min(1, 'Add a surname').max(80),
  dob: optionalIsoDate,
  gender: z.enum(GENDERS).default('Unspecified'),
  email: optEmail,
  password: z.string().max(200).optional().default(''),
  tel: optionalText(40), mobile: optionalText(40), mobile2: optionalText(40),
  address: optionalText(300), postcode: optionalText(12),
  status: z.enum(STUDENT_STATUSES).default('Waiting List'),
  startDate: optionalIsoDate, leftDate: optionalIsoDate,
  // number = put in that class, 'none' = remove from classes (waiting list), absent = leave classes alone
  classId: z.union([z.literal(''), z.literal('none'), z.coerce.number().int().positive()]).optional().transform((v) => (v === '' ? undefined : v)),
  medicalNotes: optionalText(5000), notes: optionalText(5000),
  deleteRegister: checkbox
}).refine((v) => !v.dob || v.dob <= todayIso(), { path: ['dob'], message: 'Date of birth can’t be in the future' })
  .refine((v) => !v.leftDate || !v.startDate || v.leftDate >= v.startDate, { path: ['leftDate'], message: 'Left date can’t be before the start date' });

export const contactLinkInput = z.object({
  contactId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (typeof v === 'number' ? v : null)),
  name: z.string().trim().max(120).optional().default(''),
  email: optEmail,
  tel: optionalText(40), mobile: optionalText(40), altMobile: optionalText(40),
  type: z.enum(CONTACT_TYPES).default('Parent'),
  relation: optionalText(60),
  isPrimary: checkbox,
  portalAccess: checkbox
}).refine((v) => v.contactId || v.name, { path: ['name'], message: 'Add the contact’s name' });
export type ContactLink = z.infer<typeof contactLinkInput>;

/** Contact rows come from the form as contacts.<i>.<field>. */
export function contactLinksFromForm(fd: FormData) {
  const idx = new Set<number>();
  for (const k of fd.keys()) { const m = /^contacts\.(\d+)\./.exec(k); if (m) idx.add(Number(m[1])); }
  return [...idx].sort((a, b) => a - b).map((i) => Object.fromEntries(
    ['contactId', 'name', 'email', 'tel', 'mobile', 'altMobile', 'type', 'relation', 'isPrimary', 'portalAccess'].map((f) => [f, fd.get(`contacts.${i}.${f}`) ?? undefined])
  ));
}

type SaveResult = { ok: true; id: number } | { ok: false; errors: FieldErrors };

/** Closes every open class assignment for a student on the given date. */
export const closeAssignments = (db: DbOrTx, studentId: number, on: string) =>
  db.update(classAssignment).set({ toDate: sql`greatest(${classAssignment.fromDate}, ${on}::date)` }).where(and(eq(classAssignment.studentId, studentId), isNull(classAssignment.toDate)));

/** "When marking someone left": drop register entries dated after the left date. Returns how many went. */
async function dropMarksAfter(db: DbOrTx, studentIds: number[], after: string) {
  const sessions = db.select({ id: registerSession.id }).from(registerSession).where(sql`${registerSession.date} > ${after}::date`);
  return (await db.delete(attendanceMark).where(and(inArray(attendanceMark.studentId, studentIds), inArray(attendanceMark.sessionId, sessions))).returning({ id: attendanceMark.id })).length;
}

export async function assignClass(db: DbOrTx, studentId: number, classId: number, from: string) {
  await db.insert(classAssignment).values({ studentId, classId, fromDate: from }).onConflictDoNothing();
}

export async function saveStudent(db: Db, actor: Actor, raw: unknown, links: unknown[], fd: FormData | null, id?: number): Promise<SaveResult> {
  const p = studentInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const errors: FieldErrors = {};
  const parsedLinks: ContactLink[] = [];
  links.forEach((l, i) => {
    const r = contactLinkInput.safeParse(l);
    if (r.success) parsedLinks.push(r.data);
    else for (const iss of r.error.issues) errors[`contacts.${i}.${String(iss.path[0])}`] ??= iss.message;
  });
  if (parsedLinks.filter((l) => l.isPrimary).length > 1) errors['contacts'] = 'Only one contact can be primary';
  const fields = fd ? await listFields(db, 'student') : [];
  const cf = fd ? answersFromForm(fields, fd) : { values: {}, errors: {} };
  Object.assign(errors, cf.errors);
  if (Object.keys(errors).length) return { ok: false, errors };

  const { password, classId, medicalNotes, deleteRegister, ...v } = p.data;
  const today = todayIso();
  if (isLeftStatus(v.status) && !v.leftDate) v.leftDate = today;

  return db.transaction(async (tx): Promise<SaveResult> => {
    if (typeof classId === 'number') {
      const [c] = await tx.select({ id: schoolClass.id }).from(schoolClass).where(eq(schoolClass.id, classId)).limit(1);
      if (!c) return { ok: false, errors: { classId: 'Choose a class' } };
    }
    const values = { ...v, medicalNotesEnc: medicalNotes ? encrypt(medicalNotes) : null, hasMedical: !!medicalNotes, updatedAt: new Date() };
    const [prev] = id ? await tx.select().from(student).where(eq(student.id, id)).limit(1) : [];
    if (id && !prev) return { ok: false, errors: { firstName: 'This student no longer exists' } };
    const [row] = id ? await tx.update(student).set(values).where(eq(student.id, id)).returning()
      : await tx.insert(student).values(values).returning();
    const sid = row!.id;

    const loginErr = await syncPortalLogin(tx, 'student', sid, v.email, password);
    if (loginErr) throw new FieldFail({ [loginErr.field]: loginErr.error });

    // Class: the form holds one class; changing it closes the old assignment and opens the new one.
    const open = await tx.select({ classId: classAssignment.classId }).from(classAssignment).where(and(eq(classAssignment.studentId, sid), isNull(classAssignment.toDate)));
    const dropped = isLeftStatus(v.status) && deleteRegister ? await dropMarksAfter(tx, [sid], v.leftDate!) : 0;
    if (isLeftStatus(v.status)) await closeAssignments(tx, sid, v.leftDate!);
    else if (typeof classId === 'number' && !open.some((o) => o.classId === classId)) {
      if (open[0]) await tx.update(classAssignment).set({ toDate: sql`greatest(${classAssignment.fromDate}, ${today}::date)` })
        .where(and(eq(classAssignment.studentId, sid), eq(classAssignment.classId, open[0].classId), isNull(classAssignment.toDate)));
      await assignClass(tx, sid, classId, v.startDate && !id ? v.startDate : today);
    } else if (classId === 'none') await closeAssignments(tx, sid, today);

    await saveLinks(tx, sid, parsedLinks);
    await saveAnswers(tx, sid, cf.values);
    const left = prev && !isLeftStatus(prev.status) && isLeftStatus(v.status);
    await audit(tx, actor, {
      action: `${id ? 'Updated' : 'Added'} student ${row!.firstName} ${row!.surname}${left ? ` (marked ${v.status})` : ''}${dropped ? `, deleted ${dropped === 1 ? '1 register entry' : `${dropped} register entries`} after ${v.leftDate}` : ''}`,
      page: 'Students', entity: 'student', entityId: sid
    });
    return { ok: true, id: sid };
  }).catch(catchFieldFail);
}

async function saveLinks(tx: DbOrTx, sid: number, links: ContactLink[]) {
  const keep: number[] = [];
  for (const [i, l] of links.entries()) {
    let cid = l.contactId;
    if (!cid) {
      const [c] = await tx.insert(contact).values({ name: l.name, email: l.email, tel: l.tel, mobile: l.mobile, altMobile: l.altMobile }).returning({ id: contact.id });
      cid = c!.id;
    }
    keep.push(cid);
    const link = { type: l.type, relation: l.relation, isPrimary: l.isPrimary, portalAccess: l.portalAccess, sortOrder: i };
    await tx.insert(studentContact).values({ studentId: sid, contactId: cid, ...link })
      .onConflictDoUpdate({ target: [studentContact.studentId, studentContact.contactId], set: link });
  }
  await tx.delete(studentContact).where(and(eq(studentContact.studentId, sid), keep.length ? notInArray(studentContact.contactId, keep) : undefined));
}

export async function getStudent(db: DbOrTx, id: number) {
  const [s] = await db.select().from(student).where(eq(student.id, id)).limit(1);
  if (!s) return null;
  const contacts = await db.select({ link: studentContact, c: contact }).from(studentContact)
    .innerJoin(contact, eq(contact.id, studentContact.contactId)).where(eq(studentContact.studentId, id)).orderBy(asc(studentContact.sortOrder));
  const classes = await db.select({ a: classAssignment, c: schoolClass }).from(classAssignment)
    .innerJoin(schoolClass, eq(schoolClass.id, classAssignment.classId)).where(eq(classAssignment.studentId, id)).orderBy(desc(classAssignment.fromDate));
  return { ...s, medicalNotes: s.medicalNotesEnc ? decrypt(s.medicalNotesEnc) : null, contacts, classes, currentClasses: classes.filter((r) => !r.a.toDate) };
}

export const listFilters = z.object({
  q: z.string().trim().max(100).optional().default(''),
  status: z.enum(['All', ...STUDENT_STATUSES]).catch('All').default('All'),
  classId: z.string().regex(/^(\d+|none)?$/).catch('').default(''),
  leftFrom: isoDate.optional().catch(undefined), leftTo: isoDate.optional().catch(undefined),
  startFrom: isoDate.optional().catch(undefined), startTo: isoDate.optional().catch(undefined),
  medical: z.literal('1').optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1)
});
export type ListFilters = z.infer<typeof listFilters>;

const classNames = sql<string | null>`(select string_agg(c.name, ', ' order by c.name) from class_assignment a join school_class c on c.id = a.class_id where a.student_id = "student"."id" and a.to_date is null)`; // qualified by hand: drizzle drops the table name inside select lists

function where(f: ListFilters, includeStatus = true): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (includeStatus && f.status !== 'All') conds.push(eq(student.status, f.status));
  if (f.q) {
    const q = f.q.replace(/^#/, '');
    conds.push(/^\d{1,9}$/.test(q) ? eq(student.id, Number(q))
      : sql`(lower(${student.firstName} || ' ' || ${student.surname}) like ${'%' + q.toLowerCase() + '%'} or lower(coalesce(${classNames}, '')) like ${'%' + q.toLowerCase() + '%'})`);
  }
  if (f.classId === 'none') conds.push(sql`not exists (select 1 from class_assignment a where a.student_id = ${student.id} and a.to_date is null)`);
  else if (f.classId) conds.push(sql`exists (select 1 from class_assignment a where a.student_id = ${student.id} and a.to_date is null and a.class_id = ${Number(f.classId)})`);
  if (f.leftFrom) conds.push(gte(student.leftDate, f.leftFrom));
  if (f.leftTo) conds.push(lte(student.leftDate, f.leftTo));
  if (f.startFrom) conds.push(gte(student.startDate, f.startFrom));
  if (f.startTo) conds.push(lte(student.startDate, f.startTo));
  if (f.medical) conds.push(eq(student.hasMedical, true));
  return and(...conds);
}

export async function listStudents(db: DbOrTx, f: ListFilters, perPage: number) {
  const today = todayIso();
  const [rows, [count], statusCounts, groups] = await Promise.all([
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname, gender: student.gender, dob: student.dob, status: student.status, hasMedical: student.hasMedical, email: student.email, classes: classNames })
      .from(student).where(where(f)).orderBy(asc(student.surname), asc(student.firstName), asc(student.id)).limit(perPage).offset((f.page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(student).where(where(f)),
    db.select({ status: student.status, n: sql<number>`count(*)::int` }).from(student).where(where(f, false)).groupBy(student.status),
    db.select().from(yearGroup).orderBy(asc(yearGroup.minAge))
  ]);
  return {
    rows: rows.map((r) => { const age = ageOn(r.dob, today); return { ...r, age, yearGroup: age === null ? null : groups.find((g) => age >= g.minAge && age <= g.maxAge)?.label ?? null }; }),
    total: count?.n ?? 0, statusCounts
  };
}

/** Students hub: current and waiting-list counts by year group. */
export async function countsByAge(db: DbOrTx) {
  const today = todayIso();
  const [rows, groups] = await Promise.all([
    db.select({ status: student.status, dob: student.dob }).from(student).where(inArray(student.status, ['Current', 'Waiting List'])),
    db.select().from(yearGroup).orderBy(asc(yearGroup.minAge))
  ]);
  const out = new Map<string, { current: number; waiting: number }>();
  for (const r of rows) {
    const age = ageOn(r.dob, today);
    const label = age === null ? 'No date of birth' : groups.find((g) => age >= g.minAge && age <= g.maxAge)?.label ?? `Age ${age}`;
    const e = out.get(label) ?? { current: 0, waiting: 0 };
    if (r.status === 'Current') e.current++; else e.waiting++;
    out.set(label, e);
  }
  return [...out].map(([label, n]) => ({ label, ...n }));
}

export const bulkInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('reject') }),
  z.object({ action: z.literal('activate'), classId: z.coerce.number().int().positive('Choose a class'), date: isoDate }),
  z.object({ action: z.literal('status'), status: z.enum(STUDENT_STATUSES), leftDate: optionalIsoDate, deleteRegister: checkbox })
]);

/** §5 Manage Students bulk actions (except permanent delete, which needs the typed school name). */
export async function bulkUpdate(db: Db, actor: Actor, ids: number[], raw: unknown): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const p = bulkInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the action' };
  const a = p.data;
  return db.transaction(async (tx) => {
    const today = todayIso();
    let label = '';
    if (a.action === 'accept') { await tx.update(student).set({ status: 'Accepted', updatedAt: new Date() }).where(inArray(student.id, ids)); label = 'Moved to Accepted'; }
    if (a.action === 'reject') {
      await tx.update(student).set({ status: 'Rejected', leftDate: today, updatedAt: new Date() }).where(inArray(student.id, ids));
      for (const id of ids) await closeAssignments(tx, id, today);
      label = 'Moved to Rejected';
    }
    if (a.action === 'activate') {
      const [c] = await tx.select().from(schoolClass).where(eq(schoolClass.id, a.classId)).limit(1);
      if (!c) return { ok: false as const, error: 'Choose a class' };
      await tx.update(student).set({ status: 'Current', startDate: a.date, leftDate: null, updatedAt: new Date() }).where(inArray(student.id, ids));
      for (const id of ids) await assignClass(tx, id, a.classId, a.date);
      label = `Moved to ${c.name} and activated from ${a.date}`;
    }
    if (a.action === 'status') {
      const leftDate = isLeftStatus(a.status) ? a.leftDate ?? today : a.leftDate;
      await tx.update(student).set({ status: a.status, leftDate, updatedAt: new Date() }).where(inArray(student.id, ids));
      if (isLeftStatus(a.status)) for (const id of ids) await closeAssignments(tx, id, leftDate!);
      const dropped = isLeftStatus(a.status) && a.deleteRegister ? await dropMarksAfter(tx, ids, leftDate!) : 0;
      label = `Set status to ${a.status}${dropped ? ` (deleted ${dropped === 1 ? '1 register entry' : `${dropped} register entries`} after ${leftDate})` : ''}`;
    }
    await audit(tx, actor, { action: `${label} for ${ids.length === 1 ? '1 student' : `${ids.length} students`}`, page: 'Manage students', entity: 'student', details: { ids } });
    return { ok: true as const, n: ids.length };
  });
}

/** Permanent delete. Callers must have checked the typed school name. */
export async function deleteStudents(db: Db, actor: Actor, ids: number[]) {
  return db.transaction(async (tx) => {
    const gone = await tx.delete(student).where(inArray(student.id, ids)).returning({ id: student.id, name: sql<string>`${student.firstName} || ' ' || ${student.surname}` });
    await audit(tx, actor, { action: `Permanently deleted ${gone.length === 1 ? '1 student' : `${gone.length} students`}`, page: 'Manage students', entity: 'student', details: { ids: gone.map((g) => g.id) } });
    return gone.length;
  });
}

/** Find Duplicate Students: same name (ignoring case and spacing) and same date of birth. */
export const duplicateStudents = (db: DbOrTx) => db.execute<{ ids: number[]; name: string; dob: string | null }>(sql`
  select array_agg(id order by id) as ids, min(first_name || ' ' || surname) as name, dob::text as dob
  from student group by lower(regexp_replace(first_name || ' ' || surname, '\\s+', ' ', 'g')), dob having count(*) > 1 order by name`);

/** Multiple Class Students: students in more than one class at once. */
export const multiClassStudents = (db: DbOrTx) => db.select({ id: student.id, firstName: student.firstName, surname: student.surname, classes: classNames })
  .from(student).where(sql`(select count(*) from class_assignment a where a.student_id = ${student.id} and a.to_date is null) > 1`).orderBy(asc(student.surname));

