import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { attendanceMark, fireDrill, registerSession, schoolClass, teacher, teacherLog } from '@/db/schema';
import { classify } from '@/lib/attendance';
import { audit, type AuditActor } from '../audit';
import { todayIso } from '../people/common';
import { readTab } from '../settings';
import { classStudentsOn, codeMap } from './registers';

/** §19 Fire drill: start (one at a time). Returns the running drill if one already exists. */
export async function startDrill(db: Db, actor: AuditActor & { identityId: number }) {
  return db.transaction(async (tx) => {
    const [running] = await tx.select().from(fireDrill).where(isNull(fireDrill.endedAt)).limit(1);
    if (running) return running;
    const [d] = await tx.insert(fireDrill).values({ startedBy: actor.identityId, startedByName: actor.name }).returning();
    await audit(tx, actor, { action: 'Started a fire drill', page: 'Fire drill', entity: 'fire_drill', entityId: d!.id });
    return d!;
  });
}

export const runningDrill = async (db: DbOrTx) => (await db.select().from(fireDrill).where(isNull(fireDrill.endedAt)).limit(1))[0] ?? null;

/**
 * The roll call: for each class with students today, who is on site. A student counts as on site if today's register
 * marks them present or late; classes whose register isn't taken list every student as "register not taken".
 */
export async function rollCall(db: DbOrTx, yearId: number, date = todayIso()) {
  const [classes, sessions, codes, staff] = await Promise.all([
    db.select({ id: schoolClass.id, name: schoolClass.name, teacher: teacher.name }).from(schoolClass).leftJoin(teacher, eq(teacher.id, schoolClass.mainTeacherId))
      .where(eq(schoolClass.academicYearId, yearId)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
    db.select().from(registerSession).where(eq(registerSession.date, date)),
    codeMap(db),
    db.select({ name: teacher.name, timeIn: teacherLog.timeIn, timeOut: teacherLog.timeOut }).from(teacherLog).innerJoin(teacher, eq(teacher.id, teacherLog.teacherId))
      .where(and(eq(teacherLog.date, date), eq(teacherLog.absent, false), sql`${teacherLog.timeIn} is not null`, isNull(teacherLog.timeOut))).orderBy(asc(teacher.name))
  ]);
  const marks = sessions.length ? await db.select().from(attendanceMark).where(inArray(attendanceMark.sessionId, sessions.map((s) => s.id))) : [];
  const out = [];
  for (const c of classes) {
    const roster = await classStudentsOn(db, c.id, date);
    if (!roster.length) continue;
    const mine = sessions.filter((s) => s.classId === c.id && s.takenAt);
    const onSite = roster.filter((s) => marks.some((m) => mine.some((x) => x.id === m.sessionId) && m.studentId === s.id && (() => { const k = classify(m, codes); return k.counted && !k.absent; })()));
    out.push({ classId: c.id, name: c.name, teacher: c.teacher, registerTaken: mine.length > 0, students: (mine.length ? onSite : roster).map((s) => ({ id: s.id, name: `${s.firstName} ${s.surname}`, hasMedical: s.hasMedical })), onRoll: roster.length });
  }
  return { classes: out, staff };
}

export async function setClassSafe(db: Db, drillId: number, classId: number, safe: boolean) {
  await db.update(fireDrill).set({ safeClassIds: safe ? sql`array_append(array_remove(${fireDrill.safeClassIds}, ${classId}), ${classId})` : sql`array_remove(${fireDrill.safeClassIds}, ${classId})` })
    .where(and(eq(fireDrill.id, drillId), isNull(fireDrill.endedAt)));
}

/** Ends the drill and saves the roll call with each class's "all safe" state as the report. */
export async function endDrill(db: Db, actor: AuditActor, drillId: number, yearId: number) {
  const call = await rollCall(db, yearId);
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(fireDrill).where(eq(fireDrill.id, drillId)).limit(1);
    if (!d || d.endedAt) return null;
    const auto = !!(await readTab(tx, 'fire')).processWithoutConfirmation;
    const report = { ...call, classes: call.classes.map((c) => ({ ...c, safe: auto || d.safeClassIds.includes(c.classId) })) };
    await tx.update(fireDrill).set({ endedAt: new Date(), report }).where(eq(fireDrill.id, drillId));
    await audit(tx, actor, { action: 'Ended the fire drill and saved the report', page: 'Fire drill', entity: 'fire_drill', entityId: drillId });
    return report;
  });
}

export const drillHistory = (db: DbOrTx) => db.select().from(fireDrill).orderBy(desc(fireDrill.startedAt)).limit(100);
