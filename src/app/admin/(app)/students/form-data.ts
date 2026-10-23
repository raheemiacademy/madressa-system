import { cookies } from 'next/headers';
import { CONTACT_TYPES, GENDERS, STUDENT_STATUSES } from '@/db/schema';
import { db } from '@/db';
import { resolveYear } from '@/server/academic-years';
import { listClasses } from '@/server/people/classes';
import { answersFor } from '@/server/people/custom-fields';

/** Everything the add/edit student form needs besides the student. */
export async function studentFormData(studentId?: number) {
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  const [classes, cf] = await Promise.all([year ? listClasses(db, year.id) : [], answersFor(db, 'student', studentId ?? 0)]);
  return {
    classes: classes.map((c) => ({ value: String(c.c.id), label: c.c.name })),
    statuses: [...STUDENT_STATUSES], genders: [...GENDERS], contactTypes: [...CONTACT_TYPES],
    fields: cf.fields.map((f) => ({ id: f.id, label: f.label, question: f.question, type: f.type, options: f.options, maxLength: f.maxLength })),
    answers: studentId ? cf.values : {}
  };
}
