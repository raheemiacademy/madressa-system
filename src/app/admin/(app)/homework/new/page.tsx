import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { toUkLocal } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { classStudentsOn } from '@/server/attendance/registers';
import { listHomeworkTemplates } from '@/server/learning/homework';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';
import { HomeworkForm } from '../HomeworkForm';

export const metadata = { title: 'Add homework' };

export default async function NewHomework() {
  await requireAdmin('edit');
  const [{ options }, teachers, templates] = await Promise.all([yearAndClasses(), db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)), listHomeworkTemplates(db)]);
  const today = todayIso();
  const rosters = Object.fromEntries(await Promise.all(options.map(async (o) => [o.value, (await classStudentsOn(db, Number(o.value), today)).map((s) => ({ value: String(s.id), label: `${s.firstName} ${s.surname}` }))])));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Add homework</h1><p>Set it for a class, or for some of its students</p></div></div>
      {options.length === 0 ? <p className="ra-empty">No classes set up for this year yet.</p>
        : <HomeworkForm classes={options} rosters={rosters} teachers={teachers.map((t) => ({ value: String(t.id), label: t.name }))} templates={templates} defaultDeadline={toUkLocal(new Date(Date.now() + 7 * 86_400_000)).slice(0, 11) + '17:00'} />}
    </div>
  );
}
