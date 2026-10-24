import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { CONTACT_TYPES, contact, contactGroup, contactGroupMember, GENDERS, loginIdentity, student, studentContact } from '@/db/schema';
import { checkbox, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import { catchFieldFail, FieldFail, optEmail, type Actor } from './common';
import { answersFromForm, listFields, saveAnswers } from './custom-fields';
import { syncPortalLogin } from './logins';

export const contactInput = z.object({
  name: z.string().trim().min(1, 'Add a name').max(120),
  email: optEmail,
  tel: optionalText(40), mobile: optionalText(40), altMobile: optionalText(40),
  address: optionalText(300), postcode: optionalText(12),
  gender: z.union([z.literal(''), z.enum(GENDERS)]).optional().transform((v) => v || null),
  active: checkbox,
  password: z.string().max(200).optional().default(''),
  groups: z.array(z.coerce.number().int().positive()).default([]),
  newGroup: optionalText(60)
});

export async function saveContact(db: Db, actor: Actor, raw: unknown, fd: FormData | null, id?: number): Promise<{ ok: true; id: number } | { ok: false; errors: FieldErrors }> {
  const p = contactInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const fields = fd ? await listFields(db, 'contact') : [];
  const cf = fd ? answersFromForm(fields, fd) : { values: {}, errors: {} };
  if (Object.keys(cf.errors).length) return { ok: false, errors: cf.errors };
  const { password, groups, newGroup, ...v } = p.data;
  return db.transaction(async (tx) => {
      const [row] = id ? await tx.update(contact).set({ ...v, updatedAt: new Date() }).where(eq(contact.id, id)).returning()
        : await tx.insert(contact).values(v).returning();
      if (!row) throw new FieldFail({ name: 'This contact no longer exists' });
      const login = await syncPortalLogin(tx, 'parent', row.id, v.email, password, v.active);
      if (login) throw new FieldFail({ [login.field]: login.error });
      const gids = [...groups];
      if (newGroup) {
        const [g] = await tx.insert(contactGroup).values({ name: newGroup }).onConflictDoNothing().returning();
        const found = g ?? (await tx.select().from(contactGroup).where(sql`lower(${contactGroup.name}) = lower(${newGroup})`))[0];
        if (found) gids.push(found.id);
      }
      await tx.delete(contactGroupMember).where(eq(contactGroupMember.contactId, row.id));
      if (gids.length) await tx.insert(contactGroupMember).values([...new Set(gids)].map((groupId) => ({ contactId: row.id, groupId }))).onConflictDoNothing();
      await saveAnswers(tx, row.id, cf.values);
      await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} contact ${row.name}`, page: 'Contacts', entity: 'contact', entityId: row.id });
      return { ok: true as const, id: row.id };
    }).catch(catchFieldFail);
}

export async function deleteContact(db: Db, actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(contact).where(eq(contact.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted contact ${row.name}`, page: 'Contacts', entity: 'contact', entityId: id });
    return !!row;
  });
}

export async function getContact(db: DbOrTx, id: number) {
  const [c] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!c) return null;
  const [students, groups, [login]] = await Promise.all([
    db.select({ link: studentContact, s: student }).from(studentContact).innerJoin(student, eq(student.id, studentContact.studentId))
      .where(eq(studentContact.contactId, id)).orderBy(asc(student.surname)),
    db.select({ id: contactGroup.id, name: contactGroup.name }).from(contactGroupMember).innerJoin(contactGroup, eq(contactGroup.id, contactGroupMember.groupId)).where(eq(contactGroupMember.contactId, id)),
    db.select().from(loginIdentity).where(eq(loginIdentity.contactId, id)).limit(1)
  ]);
  return { ...c, students, groups, login: login ?? null };
}

export const listGroups = (db: DbOrTx) => db.select({ id: contactGroup.id, name: contactGroup.name, n: sql<number>`(select count(*)::int from contact_group_member m where m.group_id = "contact_group"."id")` })
  .from(contactGroup).orderBy(asc(contactGroup.name));

export async function listContacts(db: DbOrTx, opts: { q?: string; groupId?: number; page: number; perPage: number }) {
  const conds = [];
  if (opts.q) {
    const q = `%${opts.q.toLowerCase()}%`;
    conds.push(sql`(lower(${contact.name}) like ${q} or lower(coalesce(${contact.email}, '')) like ${q} or regexp_replace(coalesce(${contact.mobile}, '') || ' ' || coalesce(${contact.tel}, ''), '\\s', '', 'g') like ${'%' + opts.q.replace(/\s/g, '') + '%'})`);
  }
  if (opts.groupId) conds.push(sql`exists (select 1 from contact_group_member m where m.contact_id = ${contact.id} and m.group_id = ${opts.groupId})`);
  const w = and(...conds);
  const [rows, [n]] = await Promise.all([
    db.select({ c: contact, students: sql<number>`(select count(*)::int from student_contact sc where sc.contact_id = "contact"."id")` })
      .from(contact).where(w).orderBy(asc(contact.name), asc(contact.id)).limit(opts.perPage).offset((opts.page - 1) * opts.perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(contact).where(w)
  ]);
  return { rows, total: n?.n ?? 0 };
}

export const linkInput = z.object({
  studentId: z.coerce.number().int().positive(),
  contactId: z.coerce.number().int().positive(),
  type: z.enum(CONTACT_TYPES).default('Parent'),
  relation: optionalText(60),
  isPrimary: checkbox,
  portalAccess: checkbox
});

/** Links (or updates the link between) a contact and a student. Making one contact primary clears the others. */
export async function linkContact(db: Db, actor: Actor, raw: unknown) {
  const p = linkInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the details' };
  const { studentId, contactId, ...link } = p.data;
  await db.transaction(async (tx) => {
    if (link.isPrimary) await tx.update(studentContact).set({ isPrimary: false }).where(eq(studentContact.studentId, studentId));
    await tx.insert(studentContact).values({ studentId, contactId, ...link }).onConflictDoUpdate({ target: [studentContact.studentId, studentContact.contactId], set: link });
    await audit(tx, actor, { action: 'Linked a contact to a student', page: 'Contacts', entity: 'student_contact', entityId: `${studentId}:${contactId}`, details: link });
  });
  return { ok: true as const };
}

export async function unlinkContact(db: Db, actor: Actor, studentId: number, contactId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(studentContact).where(and(eq(studentContact.studentId, studentId), eq(studentContact.contactId, contactId)));
    await audit(tx, actor, { action: 'Unlinked a contact from a student', page: 'Contacts', entity: 'student_contact', entityId: `${studentId}:${contactId}` });
  });
}

export async function setLinkFlags(db: Db, actor: Actor, studentId: number, contactId: number, flags: { isPrimary?: boolean; portalAccess?: boolean }) {
  await db.transaction(async (tx) => {
    if (flags.isPrimary) await tx.update(studentContact).set({ isPrimary: false }).where(eq(studentContact.studentId, studentId));
    await tx.update(studentContact).set(flags).where(and(eq(studentContact.studentId, studentId), eq(studentContact.contactId, contactId)));
    await audit(tx, actor, { action: 'Changed a contact’s access to a student', page: 'Parent portal access', entity: 'student_contact', entityId: `${studentId}:${contactId}`, details: flags });
  });
}

/** Block or unblock a contact from the parent portal entirely. */
export async function setContactBlocked(db: Db, actor: Actor, contactId: number, blocked: boolean) {
  await db.transaction(async (tx) => {
    await tx.update(loginIdentity).set({ allowLogin: !blocked }).where(eq(loginIdentity.contactId, contactId));
    if (blocked) await tx.execute(sql`delete from session where identity_id in (select id from login_identity where contact_id = ${contactId})`);
    await audit(tx, actor, { action: `${blocked ? 'Blocked' : 'Unblocked'} a contact on the parent portal`, page: 'Parent portal access', entity: 'contact', entityId: contactId });
  });
}

/** "Set student address to this" and "Sync": copy the contact's address to linked students. */
export async function copyAddressToStudents(db: Db, actor: Actor, contactId: number, studentIds?: number[]) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(contact).where(eq(contact.id, contactId)).limit(1);
    if (!c) return 0;
    const linked = (await tx.select({ id: studentContact.studentId }).from(studentContact).where(eq(studentContact.contactId, contactId))).map((r) => r.id)
      .filter((id) => !studentIds || studentIds.includes(id));
    if (!linked.length) return 0;
    await tx.update(student).set({ address: c.address, postcode: c.postcode, updatedAt: new Date() }).where(inArray(student.id, linked));
    await audit(tx, actor, { action: `Copied ${c.name}’s address to ${linked.length === 1 ? '1 student' : `${linked.length} students`}`, page: 'Contacts', entity: 'contact', entityId: contactId, details: { studentIds: linked } });
    return linked.length;
  });
}

/* ───────── Contact tools ───────── */

const norm = (col: typeof contact.email | typeof contact.mobile, digits: boolean) =>
  digits ? sql`regexp_replace(${col}, '\\D', '', 'g')` : sql`lower(${col})`;

/** Check email / mobile conflicts: the same email or mobile number on more than one contact. */
export async function conflicts(db: DbOrTx, by: 'email' | 'mobile') {
  const col = by === 'email' ? contact.email : contact.mobile;
  const key = norm(col, by === 'mobile');
  return db.execute<{ value: string; ids: number[]; names: string[] }>(sql`
    select ${key} as value, array_agg(${contact.id} order by ${contact.id}) as ids, array_agg(${contact.name} order by ${contact.id}) as names
    from ${contact} where coalesce(${col}, '') <> '' group by ${key} having count(*) > 1 order by 1`);
}

export const studentsWithoutContacts = (db: DbOrTx) => db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status })
  .from(student).where(sql`not exists (select 1 from student_contact sc where sc.student_id = ${student.id})`).orderBy(asc(student.surname));

export const contactsWithoutStudents = (db: DbOrTx) => db.select({ id: contact.id, name: contact.name, email: contact.email })
  .from(contact).where(sql`not exists (select 1 from student_contact sc where sc.contact_id = ${contact.id})`).orderBy(asc(contact.name));

/** Multiple contact assignments: contacts with the same name linked to the same student (likely duplicates). */
export const duplicateAssignments = (db: DbOrTx) => db.execute<{ student_id: number; student: string; name: string; contact_ids: number[] }>(sql`
  select sc.student_id, s.first_name || ' ' || s.surname as student, min(c.name) as name, array_agg(c.id order by c.id) as contact_ids
  from student_contact sc join contact c on c.id = sc.contact_id join student s on s.id = sc.student_id
  group by sc.student_id, s.first_name, s.surname, lower(c.name) having count(*) > 1 order by 2`);

export const massAssignInput = z.object({
  contactIds: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one contact'),
  type: z.union([z.literal(''), z.enum(CONTACT_TYPES)]).optional().transform((v) => v || undefined),
  relation: z.string().trim().max(60).optional().transform((v) => v || undefined),
  isPrimary: z.enum(['', 'yes', 'no']).default(''),
  portalAccess: z.enum(['', 'yes', 'no']).default('')
});

/** Mass-assign link settings (relation, type, primary, portal access) for the chosen contacts' links. */
export async function massAssign(db: Db, actor: Actor, raw: unknown) {
  const p = massAssignInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the choices' };
  const v = p.data;
  const set = {
    ...(v.type ? { type: v.type } : {}), ...(v.relation ? { relation: v.relation } : {}),
    ...(v.isPrimary ? { isPrimary: v.isPrimary === 'yes' } : {}), ...(v.portalAccess ? { portalAccess: v.portalAccess === 'yes' } : {})
  };
  if (!Object.keys(set).length) return { ok: false as const, error: 'Choose something to change' };
  await db.transaction(async (tx) => {
    await tx.update(studentContact).set(set).where(inArray(studentContact.contactId, v.contactIds));
    await audit(tx, actor, { action: `Mass-assigned link settings for ${v.contactIds.length === 1 ? '1 contact' : `${v.contactIds.length} contacts`}`, page: 'Contacts', entity: 'student_contact', details: { ...set, contactIds: v.contactIds } });
  });
  return { ok: true as const };
}
