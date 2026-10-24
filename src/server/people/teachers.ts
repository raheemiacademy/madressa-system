import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { GENDERS, loginIdentity, TEACHER_STATUSES, teacher, teacherEmergencyContact, teacherHours } from '@/db/schema';
import { optionalIsoDate, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import { hashPassword } from '../auth';
import { decrypt, encrypt } from '../crypto';
import { catchFieldFail, FieldFail, optEmail, type Actor } from './common';
import { answersFromForm, listFields, saveAnswers } from './custom-fields';
import { syncPortalLogin } from './logins';

const enc = (v: string | null) => (v ? encrypt(v) : null);
const dec = (v: string | null) => (v ? decrypt(v) : '');

export const teacherInput = z.object({
  name: z.string().trim().min(1, 'Add a name').max(120),
  dob: optionalIsoDate,
  gender: z.enum(GENDERS).default('Unspecified'),
  email: optEmail,
  password: z.string().max(200).optional().default(''),
  kioskPin: z.union([z.literal(''), z.string().regex(/^\d{4,8}$/, 'Use 4 to 8 digits')]).optional().default(''),
  tel: optionalText(40), mobile: optionalText(40),
  status: z.enum(TEACHER_STATUSES).default('Employed'),
  startDate: optionalIsoDate, leftDate: optionalIsoDate,
  address: optionalText(300), postcode: optionalText(12),
  niNumber: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]$/, 'Use the format QQ 12 34 56 C')]).optional().transform((v) => v?.replace(/\s/g, '') || null),
  dbsNumber: optionalText(40), dbsIssuedOn: optionalIsoDate, dbsExpiresOn: optionalIsoDate,
  medical: optionalText(5000),
  bankName: optionalText(120),
  bankAccount: z.union([z.literal(''), z.string().regex(/^\d{8}$/, 'Use the 8-digit account number')]).optional().transform((v) => v || null),
  bankSortCode: z.union([z.literal(''), z.string().regex(/^\d{2}-?\d{2}-?\d{2}$/, 'Use the format 12-34-56')]).optional().transform((v) => v || null)
}).refine((v) => !v.leftDate || !v.startDate || v.leftDate >= v.startDate, { path: ['leftDate'], message: 'Left date can’t be before the start date' })
  .refine((v) => !v.dbsIssuedOn || !v.dbsExpiresOn || v.dbsExpiresOn > v.dbsIssuedOn, { path: ['dbsExpiresOn'], message: 'Expiry must be after the issue date' });

export const emergencyInput = z.object({ name: z.string().trim().max(120), relation: optionalText(60), phone: optionalText(40) });

export function emergencyFromForm(fd: FormData) {
  const names = fd.getAll('ec.name'), rel = fd.getAll('ec.relation'), phone = fd.getAll('ec.phone');
  return names.map((n, i) => ({ name: String(n), relation: String(rel[i] ?? ''), phone: String(phone[i] ?? '') })).filter((e) => e.name.trim());
}

type R = { ok: true; id: number } | { ok: false; errors: FieldErrors };

export async function saveTeacher(db: Db, actor: Actor, raw: unknown, emergency: unknown[], fd: FormData | null, id?: number): Promise<R> {
  const p = teacherInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const ec = z.array(emergencyInput).max(5).safeParse(emergency);
  if (!ec.success) return { ok: false, errors: { emergency: 'Check the emergency contacts' } };
  const cf = fd ? answersFromForm(await listFields(db, 'teacher'), fd) : { values: {}, errors: {} };
  if (Object.keys(cf.errors).length) return { ok: false, errors: cf.errors };
  const { password, kioskPin, niNumber, medical, bankName, bankAccount, bankSortCode, ...v } = p.data;
  const values = {
    ...v, niNumberEnc: enc(niNumber), medicalEnc: enc(medical), bankNameEnc: enc(bankName), bankAccountEnc: enc(bankAccount),
    bankSortCodeEnc: enc(bankSortCode), ...(kioskPin ? { kioskPinHash: await hashPassword(kioskPin) } : {})
  };
  return db.transaction(async (tx): Promise<R> => {
    const [row] = id ? await tx.update(teacher).set(values).where(and(eq(teacher.id, id), isNull(teacher.deletedAt))).returning()
      : await tx.insert(teacher).values(values).returning();
    if (!row) return { ok: false, errors: { name: 'This teacher no longer exists' } };
    const login = await syncPortalLogin(tx, 'teacher', row.id, v.email, password);
    if (login) throw new FieldFail({ [login.field]: login.error });
    await tx.delete(teacherEmergencyContact).where(eq(teacherEmergencyContact.teacherId, row.id));
    if (ec.data.length) await tx.insert(teacherEmergencyContact).values(ec.data.map((e) => ({ ...e, teacherId: row.id })));
    await saveAnswers(tx, row.id, cf.values);
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} teacher ${row.name}`, page: 'Teachers', entity: 'teacher', entityId: row.id, details: { kioskPinChanged: !!kioskPin, passwordChanged: !!password } });
    return { ok: true, id: row.id };
  }).catch(catchFieldFail);
}

export async function getTeacher(db: DbOrTx, id: number) {
  const [t] = await db.select().from(teacher).where(and(eq(teacher.id, id), isNull(teacher.deletedAt))).limit(1);
  if (!t) return null;
  const [emergency, hours, [login]] = await Promise.all([
    db.select().from(teacherEmergencyContact).where(eq(teacherEmergencyContact.teacherId, id)),
    db.select().from(teacherHours).where(eq(teacherHours.teacherId, id)).orderBy(asc(teacherHours.weekday)),
    db.select().from(loginIdentity).where(eq(loginIdentity.teacherId, id)).limit(1)
  ]);
  return {
    ...t, niNumber: dec(t.niNumberEnc), medical: dec(t.medicalEnc), bankName: dec(t.bankNameEnc), bankAccount: dec(t.bankAccountEnc), bankSortCode: dec(t.bankSortCodeEnc),
    hasKioskPin: !!t.kioskPinHash, emergency, hours, login: login ?? null
  };
}

export async function listTeachers(db: DbOrTx, status?: string) {
  const rows = await db.select({
    id: teacher.id, name: teacher.name, status: teacher.status, email: teacher.email, mobile: teacher.mobile, gender: teacher.gender,
    dbsExpiresOn: teacher.dbsExpiresOn,
    days: sql<number[] | null>`(select array_agg(h.weekday order by h.weekday) from teacher_hours h where h.teacher_id = "teacher"."id")`
  }).from(teacher).where(and(isNull(teacher.deletedAt), status ? sql`${teacher.status} = ${status}` : undefined)).orderBy(asc(teacher.name));
  return rows;
}

/** Soft delete (teacher logs and history keep their name); removes the portal login. */
export async function deleteTeachers(db: Db, actor: Actor, ids: number[]) {
  return db.transaction(async (tx) => {
    const gone = await tx.update(teacher).set({ deletedAt: new Date() }).where(and(inArray(teacher.id, ids), isNull(teacher.deletedAt))).returning({ id: teacher.id });
    await tx.delete(loginIdentity).where(inArray(loginIdentity.teacherId, ids));
    await audit(tx, actor, { action: `Deleted ${gone.length === 1 ? '1 teacher' : `${gone.length} teachers`}`, page: 'Teachers', entity: 'teacher', details: { ids: gone.map((g) => g.id) } });
    return gone.length;
  });
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time such as 17:00');
export const hoursInput = z.array(z.object({ weekday: z.number().int().min(1).max(7), start: z.union([z.literal(''), time]), end: z.union([z.literal(''), time]) }))
  .superRefine((rows, ctx) => rows.forEach((r, i) => {
    if (!!r.start !== !!r.end) ctx.addIssue({ code: 'custom', path: [i], message: 'Add both a start and a finish time, or neither' });
    else if (r.start && r.end <= r.start) ctx.addIssue({ code: 'custom', path: [i], message: 'Finish must be after start' });
  }));

/** Working hours: replaces the given teachers' times for the given weekdays (blank = not working that day). */
export async function setHours(db: Db, actor: Actor, teacherIds: number[], raw: unknown) {
  const p = hoursInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: Object.fromEntries(p.error.issues.map((i) => [`day.${String(i.path[0])}`, i.message])) as FieldErrors };
  const days = p.data;
  await db.transaction(async (tx) => {
    await tx.delete(teacherHours).where(and(inArray(teacherHours.teacherId, teacherIds), inArray(teacherHours.weekday, days.map((d) => d.weekday))));
    const rows = teacherIds.flatMap((t) => days.filter((d) => d.start).map((d) => ({ teacherId: t, weekday: d.weekday, startTime: d.start, endTime: d.end })));
    if (rows.length) await tx.insert(teacherHours).values(rows);
    await audit(tx, actor, { action: `Updated working hours for ${teacherIds.length === 1 ? '1 teacher' : `${teacherIds.length} teachers`}`, page: 'Working hours', entity: 'teacher', details: { teacherIds, weekdays: days.map((d) => d.weekday) } });
  });
  return { ok: true as const };
}

export const allHours = (db: DbOrTx) => db.select({ teacherId: teacherHours.teacherId, weekday: teacherHours.weekday, startTime: teacherHours.startTime, endTime: teacherHours.endTime }).from(teacherHours);
