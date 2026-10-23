import { db } from '@/db';
import { GENDERS, TEACHER_STATUSES } from '@/db/schema';
import { answersFor } from '@/server/people/custom-fields';
import { TeacherForm, type TeacherValues } from './TeacherForm';

/** Shared by the add and edit pages. */
export async function TeacherFormPage({ t }: { t: TeacherValues }) {
  const cf = await answersFor(db, 'teacher', t.id ?? 0);
  return (
    <TeacherForm t={t} statuses={[...TEACHER_STATUSES]} genders={[...GENDERS]}
      fields={cf.fields.map((f) => ({ id: f.id, label: f.label, question: f.question, type: f.type, options: f.options, maxLength: f.maxLength }))}
      answers={t.id ? cf.values : {}} />
  );
}
