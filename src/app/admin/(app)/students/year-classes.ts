import { cookies } from 'next/headers';
import { db } from '@/db';
import { resolveYear } from '@/server/academic-years';
import { listClasses } from '@/server/people/classes';

/** The year chosen in the top-bar switcher and its classes. */
export async function yearAndClasses() {
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  const classes = year ? await listClasses(db, year.id) : [];
  return { year, classes, options: classes.map((c) => ({ value: String(c.c.id), label: c.c.name })) };
}
