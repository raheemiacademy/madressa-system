import { db } from '@/db';
import { classStudentsOn } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';

/** Each class's students today, for the student pickers. */
export async function rostersFor(classes: { value: string }[]) {
  const today = todayIso();
  return Object.fromEntries(await Promise.all(classes.map(async (c) => [c.value, (await classStudentsOn(db, Number(c.value), today)).map((s) => ({ value: String(s.id), label: `${s.firstName} ${s.surname}` }))])));
}
