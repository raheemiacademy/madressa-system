import { TZDate } from '@date-fns/tz';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { applicationGroup, contact, GENDERS, student, studentApplicationGroup, studentContact } from '@/db/schema';
import { audit } from '../audit';
import { hitRateLimit } from '../auth';
import { encrypt } from '../crypto';
import { readTab } from '../settings';
import { listFields, parseAnswer, saveAnswers, type CustomFieldDef } from './custom-fields';
import { todayIso } from './common';
import { currentYear } from '../academic-years';
import { createAdmissionFees } from '../fees/generate';

/** "YYYY-MM-DDTHH:mm" entered in UK time → instant. */
const ukLocal = (s: string) => {
  const [d, t] = s.split('T') as [string, string];
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const [h, min] = t.split(':').map(Number) as [number, number];
  return new TZDate(y, m - 1, day, h, min, 'Europe/London');
};

export function formWindow(settings: Record<string, unknown>, now = new Date()): 'open' | 'disabled' | 'not-yet' | 'closed' {
  if (!settings.enabled) return 'disabled';
  if (settings.opensAt && now < ukLocal(String(settings.opensAt))) return 'not-yet';
  if (settings.closesAt && now >= ukLocal(String(settings.closesAt))) return 'closed';
  return 'open';
}

export const enabledGroups = (db: DbOrTx) => db.select().from(applicationGroup).where(eq(applicationGroup.enabled, true)).orderBy(asc(applicationGroup.sortOrder), asc(applicationGroup.name));
export const registrationFields = async (db: DbOrTx) => (await listFields(db, 'student')).filter((f) => f.onRegistration);

const text = (max: number) => z.string().trim().max(max);
const phone = z.string().trim().max(40).regex(/^[+\d\s()-]*$/, 'Use digits, spaces and + only');
const email = z.union([z.literal(''), z.email('Enter a valid email address').max(200)]);
const dob = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).refine((v) => !v || (v <= todayIso() && v >= '1900-01-01'), 'Enter a real date of birth');

const child = z.object({ firstName: text(80).min(1, 'Add a first name'), surname: text(80), dob, gender: z.enum(GENDERS).catch('Unspecified'), medical: text(2000) });

export type ApplyResult = { ok: true; count: number } | { ok: false; errors: Record<string, string> };
type Meta = { ip: string | null };

/** Reads child blocks child.<i>.<field> from the form. */
const childIndexes = (fd: FormData) => [...new Set([...fd.keys()].map((k) => /^child\.(\d+)\./.exec(k)?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b).slice(0, 8);

function groupsFor(fd: FormData, prefix: string, groups: (typeof applicationGroup.$inferSelect)[], errors: Record<string, string>) {
  const chosen = fd.getAll(`${prefix}groups`).map(Number).filter((id) => groups.some((g) => g.id === id));
  for (const g of groups) {
    if (g.required && !chosen.includes(g.id)) errors[`${prefix}groups`] = `Choose ${g.name}`;
  }
  const single = groups.filter((g) => !g.multipleChoice);
  if (single.length && chosen.filter((id) => single.some((g) => g.id === id)).length > 1) errors[`${prefix}groups`] = 'Choose only one option';
  return chosen;
}

function answers(fields: CustomFieldDef[], fd: FormData, prefix: string, errors: Record<string, string>) {
  const values: Record<number, unknown> = {};
  for (const f of fields) {
    const name = `${prefix}cf.${f.id}`;
    const r = parseAnswer(f, f.type === 'checkboxes' ? fd.getAll(name).map(String) : (fd.get(name) as string | null) ?? undefined);
    if ('error' in r) errors[name] = r.error; else values[f.id] = r.value;
  }
  return values;
}

/** Public application (§5 Registration pages). Children arrive as Waiting List students with the parent as primary contact. */
export async function submitApplication(db: Db, kind: 'child' | 'adult', fd: FormData, meta: Meta): Promise<ApplyResult> {
  const settings = await readTab(db, 'registration');
  if (formWindow(settings) !== 'open' || (kind === 'adult' && !settings.adultEnabled)) return { ok: false, errors: { form: 'Applications are not open at the moment.' } };
  if (String(fd.get('website') ?? '') !== '') return { ok: true, count: 0 }; // honeypot: pretend success to bots
  const key = meta.ip ? `apply:${meta.ip}` : 'apply:all';
  if (!(await hitRateLimit(db, key, meta.ip ? { hits: 10, windowMs: 3_600_000 } : { hits: 300, windowMs: 3_600_000 }))) {
    return { ok: false, errors: { form: 'Too many applications from here. Please try again later.' } };
  }
  const [groups, fields] = await Promise.all([enabledGroups(db), registrationFields(db)]);
  const errors: Record<string, string> = {};
  const g = (k: string) => String(fd.get(k) ?? '');
  const need = (k: string, label: string, on: boolean) => { if (on && !g(k).trim()) errors[k] = `Add ${label}`; };

  const person = z.object({ name: text(120), email, mobile: phone, tel: phone, address: text(300), postcode: text(12) });
  const p = person.safeParse({ name: g('name'), email: g('email'), mobile: g('mobile'), tel: g('tel'), address: g('address'), postcode: g('postcode') });
  if (!p.success) for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message;
  need('mobile', 'a mobile number', !!settings.requireMobile);
  need('address', 'an address', !!settings.requireAddress);
  need('postcode', 'a postcode', !!settings.requireAddress);

  if (kind === 'adult') {
    const a = child.safeParse({ firstName: g('firstName'), surname: g('surname'), dob: g('dob'), gender: g('gender'), medical: g('medical') });
    if (!a.success) for (const i of a.error.issues) errors[String(i.path[0])] ??= i.message;
    if (!g('surname').trim()) errors.surname ??= 'Add a surname';
    need('dob', 'a date of birth', !!settings.requireDob);
    const chosen = groupsFor(fd, '', groups, errors);
    const values = answers(fields, fd, '', errors);
    if (Object.keys(errors).length || !a.success || !p.success) return { ok: false, errors };
    await db.transaction(async (tx) => {
      const [s] = await tx.insert(student).values({
        firstName: a.data.firstName, surname: a.data.surname, dob: a.data.dob || null, gender: a.data.gender, email: p.data.email || null,
        mobile: p.data.mobile || null, tel: p.data.tel || null, address: p.data.address || null, postcode: p.data.postcode || null,
        medicalNotesEnc: a.data.medical ? encrypt(a.data.medical) : null, hasMedical: !!a.data.medical, status: 'Waiting List', isAdult: true, source: 'adult-form'
      }).returning();
      if (chosen.length) await tx.insert(studentApplicationGroup).values(chosen.map((groupId) => ({ studentId: s!.id, groupId })));
      await saveAnswers(tx, s!.id, values);
      await admissionOnApply(tx, [s!.id], 'Adult application form');
      await audit(tx, { identityId: null, name: 'Adult application form' }, { action: `New adult application: ${s!.firstName} ${s!.surname}`, page: 'Registration', entity: 'student', entityId: s!.id });
    });
    return { ok: true, count: 1 };
  }

  if (!g('name').trim()) errors.name = 'Add your name';
  if (!g('email').trim() && !g('mobile').trim()) errors.email ??= 'Add an email address or mobile number';
  const ec = { name: g('ecName').trim(), phone: g('ecPhone').trim(), relation: g('ecRelation').trim().slice(0, 60) };
  if (settings.requireEmergency && (!ec.name || !ec.phone)) errors.ecName = 'Add an emergency contact’s name and phone number';
  if (ec.phone && !/^[+\d\s()-]{6,40}$/.test(ec.phone)) errors.ecPhone = 'Enter a phone number';

  const idx = childIndexes(fd);
  if (!idx.length) errors.form = 'Add at least one child';
  const parentSurname = g('name').trim().split(/\s+/).slice(-1)[0] ?? '';
  const kids = idx.map((i) => {
    const pre = `child.${i}.`;
    const surname = g(`${pre}surname`).trim() || (settings.copySurname ? parentSurname : '');
    const r = child.safeParse({ firstName: g(`${pre}firstName`), surname, dob: g(`${pre}dob`), gender: g(`${pre}gender`), medical: g(`${pre}medical`) });
    if (!r.success) for (const iss of r.error.issues) errors[`${pre}${String(iss.path[0])}`] ??= iss.message;
    if (!surname) errors[`${pre}surname`] ??= 'Add a surname';
    if (settings.requireDob && !g(`${pre}dob`)) errors[`${pre}dob`] = 'Add a date of birth';
    return { data: r.success ? r.data : null, surname, groups: groupsFor(fd, pre, groups, errors), values: answers(fields, fd, pre, errors) };
  });
  if (Object.keys(errors).length || !p.success) return { ok: false, errors };

  await db.transaction(async (tx) => {
    const [parent] = await tx.insert(contact).values({ name: p.data.name, email: p.data.email || null, mobile: p.data.mobile || null, tel: p.data.tel || null, address: p.data.address || null, postcode: p.data.postcode || null }).returning();
    const [emergency] = ec.name ? await tx.insert(contact).values({ name: ec.name, mobile: ec.phone || null }).returning() : [];
    const ids: number[] = [];
    for (const k of kids) {
      const d = k.data!;
      const [s] = await tx.insert(student).values({
        firstName: d.firstName, surname: k.surname, dob: d.dob || null, gender: d.gender, address: p.data.address || null, postcode: p.data.postcode || null,
        medicalNotesEnc: d.medical ? encrypt(d.medical) : null, hasMedical: !!d.medical, status: 'Waiting List', source: 'form'
      }).returning();
      await tx.insert(studentContact).values({ studentId: s!.id, contactId: parent!.id, type: 'Parent', isPrimary: true, relation: g('relation').trim().slice(0, 60) || null });
      if (emergency) await tx.insert(studentContact).values({ studentId: s!.id, contactId: emergency.id, type: 'Emergency', relation: ec.relation || null, portalAccess: false });
      if (k.groups.length) await tx.insert(studentApplicationGroup).values(k.groups.map((groupId) => ({ studentId: s!.id, groupId })));
      await saveAnswers(tx, s!.id, k.values);
      ids.push(s!.id);
    }
    await admissionOnApply(tx, ids, 'Application form');
    await audit(tx, { identityId: null, name: 'Application form' }, { action: `New application for ${kids.length === 1 ? '1 child' : `${kids.length} children`} from ${p.data.name}`, page: 'Registration', entity: 'contact', entityId: parent!.id });
  });
  return { ok: true, count: kids.length };
}

/** Fees settings: "create an admission fee invoice when an application form is submitted" (skipped if no fee or year is set). */
async function admissionOnApply(tx: DbOrTx, ids: number[], name: string) {
  if (!(await readTab(tx, 'fees')).admissionInvoiceOnApplication) return;
  const year = await currentYear(tx);
  if (year) await createAdmissionFees(tx, { identityId: null, name }, ids, year.id);
}

export const groupNamesFor = (db: DbOrTx, studentIds: number[]) => studentIds.length
  ? db.select({ studentId: studentApplicationGroup.studentId, name: applicationGroup.name }).from(studentApplicationGroup)
    .innerJoin(applicationGroup, eq(applicationGroup.id, studentApplicationGroup.groupId)).where(inArray(studentApplicationGroup.studentId, studentIds))
  : Promise.resolve([]);
