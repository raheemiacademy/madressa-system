import { eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { academicYear, CONTACT_TYPES, contact, GENDERS, schoolClass, STUDENT_STATUSES, student, studentContact, TEACHER_STATUSES, teacher, yearGroup } from '@/db/schema';
import { audit } from '../audit';
import { encrypt } from '../crypto';
import { isLeftStatus, todayIso, type Actor } from './common';
import { csvBool, csvDate, csvIds } from './csv';
import { assignClass, closeAssignments } from './students';

export type ImportKind = 'students' | 'contacts' | 'teachers' | 'classes';
type StudentRow = { id: number | null; classId: number | null; medicalNotes: string | null; contactName: string | null; contactRelation: string | null; contactEmail: string | null; contactMobile: string | null } & Record<string, unknown>;
type ContactRow = { id: number | null; studentIds: number[]; type: (typeof CONTACT_TYPES)[number]; relation: string | null; isPrimary: boolean; name: string } & Record<string, unknown>;
export type RowResult = { line: number; ok: boolean; errors: string[]; summary: string; data?: Record<string, unknown> };

/** Columns for each import's CSV template; `id` means "update the existing record" (Export/Import Edit). */
export const COLUMNS: Record<ImportKind, { name: string; required?: boolean; help: string }[]> = {
  students: [
    { name: 'id', help: 'Leave blank for new students; keep it to update an existing one' },
    { name: 'first_name', required: true, help: 'First name' }, { name: 'surname', required: true, help: 'Surname' },
    { name: 'dob', help: 'Date of birth, DD/MM/YYYY' }, { name: 'gender', help: GENDERS.join(', ') },
    { name: 'status', help: STUDENT_STATUSES.join(', ') }, { name: 'class', help: 'Class name in the current year' },
    { name: 'start_date', help: 'DD/MM/YYYY' }, { name: 'left_date', help: 'DD/MM/YYYY' },
    { name: 'email', help: 'Student login email' }, { name: 'tel', help: '' }, { name: 'mobile', help: '' }, { name: 'mobile2', help: '' },
    { name: 'address', help: '' }, { name: 'postcode', help: '' }, { name: 'medical_notes', help: 'Stored encrypted' }, { name: 'notes', help: '' },
    { name: 'contact_name', help: 'New contacts only: adds a Parent contact' }, { name: 'contact_relation', help: 'e.g. Mother' },
    { name: 'contact_email', help: '' }, { name: 'contact_mobile', help: '' }
  ],
  contacts: [
    { name: 'id', help: 'Leave blank for new contacts; keep it to update an existing one' },
    { name: 'name', required: true, help: 'Full name' }, { name: 'email', help: '' }, { name: 'tel', help: '' }, { name: 'mobile', help: '' },
    { name: 'alt_mobile', help: '' }, { name: 'address', help: '' }, { name: 'postcode', help: '' }, { name: 'gender', help: GENDERS.join(', ') },
    { name: 'student_ids', help: 'Student IDs to link, separated by commas or hyphens' }, { name: 'type', help: CONTACT_TYPES.join(', ') },
    { name: 'relation', help: 'e.g. Father' }, { name: 'primary', help: 'yes or no' }
  ],
  teachers: [
    { name: 'name', required: true, help: 'Full name' }, { name: 'email', help: '' }, { name: 'tel', help: '' }, { name: 'mobile', help: '' },
    { name: 'gender', help: GENDERS.join(', ') }, { name: 'status', help: TEACHER_STATUSES.join(', ') },
    { name: 'dob', help: 'DD/MM/YYYY' }, { name: 'start_date', help: 'DD/MM/YYYY' }
  ],
  classes: [
    { name: 'name', required: true, help: 'Class name' }, { name: 'year_group', help: 'Year group label' },
    { name: 'teacher', help: 'Main teacher’s name' }, { name: 'capacity', help: 'Number of places' }
  ]
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T) => {
  const hit = allowed.find((a) => a.toLowerCase() === (v ?? '').trim().toLowerCase());
  return { value: hit ?? fallback, bad: !!v?.trim() && !hit };
};

/** Validates rows without writing anything. The same function runs again on confirm, so the preview can't be tampered with. */
export async function checkRows(db: Db, kind: ImportKind, rows: Record<string, string>[], yearId: number | null): Promise<RowResult[]> {
  const out: RowResult[] = [];
  const classes = yearId ? await db.select({ id: schoolClass.id, name: schoolClass.name }).from(schoolClass).where(eq(schoolClass.academicYearId, yearId)) : [];
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
  const existing = new Set<number>();
  if (ids.length && (kind === 'students' || kind === 'contacts')) {
    const t = kind === 'students' ? student : contact;
    for (const r of await db.select({ id: t.id }).from(t).where(inArray(t.id, ids))) existing.add(r.id);
  }
  const groups = kind === 'classes' ? await db.select().from(yearGroup) : [];
  const teachers = kind === 'classes' ? await db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)) : [];
  const studentIdsAll = kind === 'contacts' ? new Set((await db.select({ id: student.id }).from(student).where(inArray(student.id, rows.flatMap((r) => csvIds(r.student_ids)).concat(0)))).map((r) => r.id)) : new Set<number>();

  rows.forEach((r, i) => {
    const errors: string[] = [];
    const line = i + 2; // header is line 1
    const date = (k: string) => { const d = csvDate(r[k]); if (d === null) errors.push(`${k} isn’t a real date (use DD/MM/YYYY)`); return d || null; };
    const email = (k: string) => { const e = (r[k] ?? '').toLowerCase(); if (e && !EMAIL.test(e)) errors.push(`${k} isn’t a valid email`); return e || null; };
    const text = (k: string, max = 300) => { const v = r[k] ?? ''; if (v.length > max) errors.push(`${k} is too long`); return v || null; };
    const id = r.id ? Number(r.id) : null;
    if (id !== null && !existing.has(id)) errors.push(`No ${kind === 'students' ? 'student' : 'contact'} has ID ${r.id}`);
    let data: Record<string, unknown> = {};
    let summary = '';

    if (kind === 'students') {
      if (!r.first_name) errors.push('first_name is required');
      if (!r.surname) errors.push('surname is required');
      const g = pick(r.gender, GENDERS, 'Unspecified'); if (g.bad) errors.push(`gender must be one of ${GENDERS.join(', ')}`);
      const s = pick(r.status, STUDENT_STATUSES, 'Waiting List'); if (s.bad) errors.push('status isn’t a known status');
      const classId = r.class ? classByName.get(r.class.toLowerCase()) : undefined;
      if (r.class && !classId) errors.push(`No class called “${r.class}” this year`);
      data = {
        id, firstName: text('first_name', 80), surname: text('surname', 80), dob: date('dob'), gender: g.value, status: s.value, classId: classId ?? null,
        startDate: date('start_date'), leftDate: date('left_date'), email: email('email'), tel: text('tel', 40), mobile: text('mobile', 40), mobile2: text('mobile2', 40),
        address: text('address'), postcode: text('postcode', 12), medicalNotes: text('medical_notes', 5000), notes: text('notes', 5000),
        contactName: text('contact_name', 120), contactRelation: text('contact_relation', 60), contactEmail: email('contact_email'), contactMobile: text('contact_mobile', 40)
      };
      summary = `${r.first_name ?? ''} ${r.surname ?? ''}`.trim();
    } else if (kind === 'contacts') {
      if (!r.name) errors.push('name is required');
      const g = pick(r.gender, GENDERS, 'Unspecified'); if (g.bad) errors.push('gender isn’t valid');
      const t = pick(r.type, CONTACT_TYPES, 'Parent'); if (t.bad) errors.push(`type must be one of ${CONTACT_TYPES.join(', ')}`);
      const sids = csvIds(r.student_ids);
      const missing = sids.filter((s) => !studentIdsAll.has(s));
      if (missing.length) errors.push(`No student with ID ${missing.join(', ')}`);
      data = { id, name: text('name', 120), email: email('email'), tel: text('tel', 40), mobile: text('mobile', 40), altMobile: text('alt_mobile', 40), address: text('address'), postcode: text('postcode', 12), gender: r.gender ? g.value : null, studentIds: sids, type: t.value, relation: text('relation', 60), isPrimary: csvBool(r.primary) };
      summary = r.name ?? '';
    } else if (kind === 'teachers') {
      if (!r.name) errors.push('name is required');
      const g = pick(r.gender, GENDERS, 'Unspecified'); if (g.bad) errors.push('gender isn’t valid');
      const s = pick(r.status, TEACHER_STATUSES, 'Employed'); if (s.bad) errors.push('status isn’t valid');
      data = { name: text('name', 120), email: email('email'), tel: text('tel', 40), mobile: text('mobile', 40), gender: g.value, status: s.value, dob: date('dob'), startDate: date('start_date') };
      summary = r.name ?? '';
    } else {
      if (!r.name) errors.push('name is required');
      if (r.name && classByName.has(r.name.toLowerCase())) errors.push('A class with this name already exists this year');
      const yg = r.year_group ? groups.find((g) => g.label.toLowerCase() === r.year_group!.toLowerCase()) : undefined;
      if (r.year_group && !yg) errors.push(`No year group called “${r.year_group}”`);
      const tch = r.teacher ? teachers.find((t) => t.name.toLowerCase() === r.teacher!.toLowerCase()) : undefined;
      if (r.teacher && !tch) errors.push(`No teacher called “${r.teacher}”`);
      const cap = r.capacity ? Number(r.capacity) : null;
      if (cap !== null && !(Number.isInteger(cap) && cap >= 0)) errors.push('capacity must be a whole number');
      data = { name: text('name', 80), yearGroupId: yg?.id ?? null, mainTeacherId: tch?.id ?? null, capacity: cap };
      summary = r.name ?? '';
    }
    out.push({ line, ok: errors.length === 0, errors, summary, data });
  });
  // Duplicate names inside one class import would clash.
  if (kind === 'classes') {
    const seen = new Set<string>();
    for (const r of out) { const n = String(r.data?.name ?? '').toLowerCase(); if (seen.has(n)) { r.ok = false; r.errors.push('Repeated in this file'); } seen.add(n); }
  }
  return out;
}

/** Writes the valid rows in one transaction. Rows with errors are skipped and reported back. */
export async function commitRows(db: Db, actor: Actor, kind: ImportKind, results: RowResult[], yearId: number | null) {
  const good = results.filter((r) => r.ok).map((r) => r.data!);
  const today = todayIso();
  await db.transaction(async (tx) => {
    for (const d of good) {
      if (kind === 'students') {
        const { id, classId, medicalNotes, contactName, contactRelation, contactEmail, contactMobile, ...v } = d as StudentRow;
        const values = { ...(v as object), medicalNotesEnc: medicalNotes ? encrypt(medicalNotes) : null, hasMedical: !!medicalNotes, source: id ? undefined : 'import', updatedAt: new Date() } as typeof student.$inferInsert;
        const [row] = id ? await tx.update(student).set(values).where(eq(student.id, id)).returning() : await tx.insert(student).values(values).returning();
        if (isLeftStatus(row!.status)) await closeAssignments(tx, row!.id, row!.leftDate ?? today);
        else if (classId) await assignClass(tx, row!.id, classId, row!.startDate ?? today);
        if (!id && contactName) {
          const [c] = await tx.insert(contact).values({ name: contactName, email: contactEmail, mobile: contactMobile }).returning();
          await tx.insert(studentContact).values({ studentId: row!.id, contactId: c!.id, type: 'Parent', relation: contactRelation, isPrimary: true });
        }
      } else if (kind === 'contacts') {
        const { id, studentIds, type, relation, isPrimary, ...v } = d as ContactRow;
        const [row] = id ? await tx.update(contact).set({ ...(v as object), updatedAt: new Date() }).where(eq(contact.id, id)).returning() : await tx.insert(contact).values(v as typeof contact.$inferInsert).returning();
        for (const sid of studentIds) {
          const link = { type, relation, isPrimary };
          if (link.isPrimary) await tx.update(studentContact).set({ isPrimary: false }).where(eq(studentContact.studentId, sid));
          await tx.insert(studentContact).values({ studentId: sid, contactId: row!.id, ...link }).onConflictDoUpdate({ target: [studentContact.studentId, studentContact.contactId], set: link });
        }
      } else if (kind === 'teachers') {
        await tx.insert(teacher).values(d as typeof teacher.$inferInsert);
      } else {
        const [y] = yearId ? await tx.select().from(academicYear).where(eq(academicYear.id, yearId)) : [];
        if (!y) throw new Error('No academic year chosen');
        await tx.insert(schoolClass).values({ ...(d as object), academicYearId: y.id, startsOn: y.startsOn, endsOn: y.endsOn } as typeof schoolClass.$inferInsert);
      }
    }
    const updated = good.filter((d) => d.id).length;
    await audit(tx, actor, { action: `Imported ${kind}: ${good.length - updated} added, ${updated} updated, ${results.length - good.length} skipped`, page: 'Import', entity: kind });
  });
  return { added: good.filter((d) => !d.id).length, updated: good.filter((d) => d.id).length, skipped: results.length - good.length };
}

/** Classes "quick add": one class name per line, with shared defaults. */
export const quickAddRows = (text: string, defaults: { year_group?: string; teacher?: string }) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500).map((name) => ({ name, year_group: defaults.year_group ?? '', teacher: defaults.teacher ?? '', capacity: '' }));

