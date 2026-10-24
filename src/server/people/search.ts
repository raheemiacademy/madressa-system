import { and, asc, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { contact, student, teacher } from '@/db/schema';

/** §1 global search: students, contacts and teachers by name, ID (#123), email or phone. */
export async function globalSearch(db: DbOrTx, raw: string, limit = 20) {
  const q = raw.trim().slice(0, 100);
  if (!q) return { students: [], contacts: [], teachers: [] };
  // "#123" or a short number is an ID; longer digit strings are phone numbers.
  const id = /^#\d{1,9}$|^\d{1,7}$/.test(q) ? Number(q.replace('#', '')) : null;
  const like = `%${q.toLowerCase()}%`;
  const digits = q.replace(/\D/g, '');
  const phone = (col: AnyPgColumn) => digits.length >= 5 ? sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g') like ${'%' + digits + '%'}` : sql`false`;
  const [students, contacts, teachers] = await Promise.all([
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status, dob: student.dob })
      .from(student).where(id ? sql`${student.id} = ${id}` : sql`lower(${student.firstName} || ' ' || ${student.surname}) like ${like} or lower(coalesce(${student.email}, '')) like ${like} or ${phone(student.mobile)}
        or exists (select 1 from custom_field_value v join custom_field f on f.id = v.field_id where f.searchable and f.entity = 'student' and v.owner_id = ${student.id} and lower(v.value::text) like ${like})`)
      .orderBy(asc(student.surname), asc(student.firstName)).limit(limit),
    db.select({ id: contact.id, name: contact.name, email: contact.email, mobile: contact.mobile })
      .from(contact).where(id ? sql`${contact.id} = ${id}` : sql`lower(${contact.name}) like ${like} or lower(coalesce(${contact.email}, '')) like ${like} or ${phone(contact.mobile)} or ${phone(contact.tel)}`)
      .orderBy(asc(contact.name)).limit(limit),
    db.select({ id: teacher.id, name: teacher.name, status: teacher.status, email: teacher.email })
      .from(teacher).where(and(isNull(teacher.deletedAt), id ? sql`${teacher.id} = ${id}` : sql`lower(${teacher.name}) like ${like} or lower(coalesce(${teacher.email}, '')) like ${like} or ${phone(teacher.mobile)}`))
      .orderBy(asc(teacher.name)).limit(limit)
  ]);
  return { students, contacts, teachers };
}
