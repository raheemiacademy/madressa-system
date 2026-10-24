import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { classAssignment, classTeacher, contact, schoolClass, student, studentContact, teacher } from '@/db/schema';
import { resolveYear } from '../academic-years';
import { LEFT_STATUSES } from '../people/common';
import { readTab } from '../settings';

/* §20 Who a portal user is and what they may reach. Every portal page and action goes through these. */

export class PortalDenied extends Error { constructor() { super('Not allowed'); } }

export type Kid = { id: number; firstName: string; surname: string; label: string; gender: string; status: string; classId: number | null; className: string | null };

/** A parent (contact) and the children they're linked to as an allowed contact type. Children who have left are not included. */
export async function parentContext(db: DbOrTx, contactId: number) {
  const [tab, [me], { year }] = await Promise.all([readTab(db, 'parentPortal'), db.select().from(contact).where(eq(contact.id, contactId)), resolveYear(db, null)]);
  if (!me) throw new PortalDenied();
  const types = (tab.contactTypesAllowed as string[]).length ? tab.contactTypesAllowed as string[] : ['Parent'];
  const rows = await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, gender: student.gender, status: student.status, isPrimary: studentContact.isPrimary })
    .from(studentContact).innerJoin(student, eq(student.id, studentContact.studentId))
    .where(and(eq(studentContact.contactId, contactId), inArray(studentContact.type, types as never[]), notInArray(student.status, [...LEFT_STATUSES])))
    .orderBy(asc(student.firstName));
  const classes = rows.length && year ? await db.select({ studentId: classAssignment.studentId, id: schoolClass.id, name: schoolClass.name }).from(classAssignment)
    .innerJoin(schoolClass, eq(schoolClass.id, classAssignment.classId))
    .where(and(inArray(classAssignment.studentId, rows.map((r) => r.id)), isNull(classAssignment.toDate), eq(schoolClass.academicYearId, year.id))) : [];
  const kids: (Kid & { isPrimary: boolean })[] = rows.map((r) => {
    const c = classes.find((x) => x.studentId === r.id);
    // Children are called by first name, unless two share one.
    const label = rows.filter((x) => x.firstName === r.firstName).length > 1 ? `${r.firstName} ${r.surname}` : r.firstName;
    return { ...r, label, classId: c?.id ?? null, className: c?.name ?? null };
  });
  return { contact: me, kids, year, hidden: tab.hiddenSections as string[], tab };
}
export type ParentCtx = Awaited<ReturnType<typeof parentContext>>;

/** The child, if this parent may see them; otherwise a refusal. */
export function childOf(ctx: ParentCtx, studentId: number) {
  const k = ctx.kids.find((x) => x.id === studentId);
  if (!k) throw new PortalDenied();
  return k;
}

export const PRIVILEGES = ['canRegister', 'canEoty', 'canMessage', 'canMerits', 'canHomework', 'canIncidents'] as const;
export type Privilege = (typeof PRIVILEGES)[number];

/** A teacher and the classes they're attached to this year, with each class's privileges. */
export async function teacherContext(db: DbOrTx, teacherId: number) {
  const [tab, [me], { year }] = await Promise.all([readTab(db, 'teacherPortal'), db.select().from(teacher).where(eq(teacher.id, teacherId)), resolveYear(db, null)]);
  if (!me || me.deletedAt) throw new PortalDenied();
  const classes = year ? await db.select({ id: schoolClass.id, name: schoolClass.name, mainTeacherId: schoolClass.mainTeacherId, p: classTeacher })
    .from(classTeacher).innerJoin(schoolClass, eq(schoolClass.id, classTeacher.classId))
    .where(and(eq(classTeacher.teacherId, teacherId), eq(schoolClass.academicYearId, year.id))).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)) : [];
  return { teacher: me, year, hidden: tab.hiddenSections as string[], tab, classes: classes.map((c) => ({ id: c.id, name: c.name, isMain: c.mainTeacherId === teacherId, ...Object.fromEntries(PRIVILEGES.map((k) => [k, c.p[k]])) as Record<Privilege, boolean> })) };
}
export type TeacherCtx = Awaited<ReturnType<typeof teacherContext>>;

/** The class, if this teacher is attached to it (and holds the privilege, when one is named). */
export function classOf(ctx: TeacherCtx, classId: number, privilege?: Privilege) {
  const c = ctx.classes.find((x) => x.id === classId);
  if (!c || (privilege && !c[privilege])) throw new PortalDenied();
  return c;
}
export const classesWith = (ctx: TeacherCtx, privilege: Privilege) => ctx.classes.filter((c) => c[privilege]);

/** Refuses a section the school has hidden in Settings → Parent/Teacher portal. */
export function section(ctx: { hidden: string[] }, name: string) {
  if (ctx.hidden.includes(name)) throw new PortalDenied();
}
export const shows = (ctx: { hidden: string[] }, name: string) => !ctx.hidden.includes(name);

/** Students currently in any of these classes. */
export async function studentsInClasses(db: DbOrTx, classIds: number[]) {
  if (!classIds.length) return [];
  return db.select({ id: student.id, firstName: student.firstName, surname: student.surname, classId: classAssignment.classId }).from(classAssignment)
    .innerJoin(student, eq(student.id, classAssignment.studentId))
    .where(and(inArray(classAssignment.classId, classIds), isNull(classAssignment.toDate))).orderBy(asc(student.firstName), asc(student.surname));
}
