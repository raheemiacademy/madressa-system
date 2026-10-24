'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { endDrill, runningDrill, setClassSafe, startDrill } from '@/server/attendance/drill';
import { yearAndClasses } from '../students/year-classes';

/** Any signed-in staff member can start a drill: it's a safety tool. */
export async function startDrillAction() {
  const a = await requireAdmin();
  await startDrill(db, actorOf(a));
  revalidatePath('/admin', 'layout');
  redirect('/admin/fire-drill');
}

export async function safeAction(classId: number, safe: boolean) {
  await requireAdmin();
  const d = await runningDrill(db);
  if (d) await setClassSafe(db, d.id, classId, safe);
  revalidatePath('/admin/fire-drill');
}

export async function endDrillAction() {
  const a = await requireAdmin();
  const d = await runningDrill(db);
  const { year } = await yearAndClasses();
  if (d && year) await endDrill(db, actorOf(a), d.id, year.id);
  revalidatePath('/admin', 'layout');
  redirect('/admin/fire-drill');
}
