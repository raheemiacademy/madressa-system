import { and, asc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { contact, invoice, loginIdentity, student, studentContact, teacher, teacherHours, teacherLog, yearGroup } from '@/db/schema';
import { summarise } from '@/lib/attendance';
import { addDays, codeMap, marksBetween, weekdayOf } from './attendance/registers';
import { inbox } from './comm/messages';
import { ageOn, LEFT_STATUSES } from './people/common';

/* §1 Dashboard. Each panel has its own read so the page can stream them separately. */

const count = sql<number>`count(*)::int`;
/** Change on a week earlier, to one decimal place; null when either side is unknown. */
export const change = (now: number | null, prior: number | null) => (now === null || prior === null ? null : Math.round((now - prior) * 10) / 10);

/** Current students and their change since last week (joined minus left in the last 7 days), plus the waiting list. */
export async function studentFigures(db: DbOrTx, today: string) {
  const weekAgo = addDays(today, -7);
  const [[cur], [wait], [joined], [left]] = await Promise.all([
    db.select({ n: count }).from(student).where(eq(student.status, 'Current')),
    db.select({ n: count }).from(student).where(eq(student.status, 'Waiting List')),
    db.select({ n: count }).from(student).where(and(eq(student.status, 'Current'), gt(student.startDate, weekAgo), lte(student.startDate, today))),
    db.select({ n: count }).from(student).where(and(inArray(student.status, [...LEFT_STATUSES]), gt(student.leftDate, weekAgo), lte(student.leftDate, today)))
  ]);
  return { current: cur!.n, waiting: wait!.n, change: joined!.n - left!.n };
}

/** Attendance today (present or late, as a %), and the same weekday last week. */
export async function attendanceFigures(db: DbOrTx, today: string) {
  const lastWeek = addDays(today, -7);
  const [now, prior, codes] = await Promise.all([marksBetween(db, today, today), marksBetween(db, lastWeek, lastWeek), codeMap(db)]);
  const pct = summarise(now, codes).standardPct;
  return { pct, change: change(pct, summarise(prior, codes).standardPct) };
}

/** Fees outstanding for the year (upcoming included, as on the Fees dashboard) as it stood 7 days ago, from what had been recorded by then. */
export async function outstandingWeekAgo(db: DbOrTx, yearId: number, now = new Date()) {
  const then = new Date(now.getTime() - 7 * 86_400_000);
  const paid = sql`coalesce((select sum(p.amount_pence) from payment p where p.invoice_id = ${invoice.id} and p.status = 'Cleared' and p.created_at <= ${then.toISOString()}::timestamptz), 0)`;
  const [r] = await db.select({ n: sql<number>`coalesce(sum(greatest(0, ${invoice.amountPence} - ${paid})), 0)`.mapWith(Number) }).from(invoice)
    .where(and(eq(invoice.academicYearId, yearId), lte(invoice.createdAt, then), or(isNull(invoice.deletedAt), gt(invoice.deletedAt, then))));
  return r!.n;
}

/** Parent contacts of current students, and how many of them have signed in to the parent portal since the year began. */
export async function parentFigures(db: DbOrTx, yearStart: string) {
  const linked = db.selectDistinct({ id: studentContact.contactId }).from(studentContact).innerJoin(student, eq(student.id, studentContact.studentId))
    .where(and(eq(student.status, 'Current'), eq(studentContact.type, 'Parent')));
  const [[total], [active]] = await Promise.all([
    db.select({ n: count }).from(contact).where(inArray(contact.id, linked)),
    db.select({ n: sql<number>`count(distinct ${loginIdentity.contactId})::int` }).from(loginIdentity)
      .where(and(eq(loginIdentity.portal, 'parent'), inArray(loginIdentity.contactId, linked), gte(loginIdentity.lastLoginAt, new Date(`${yearStart}T00:00:00Z`))))
  ]);
  return { total: total!.n, active: active!.n };
}

/** Today's teacher sign-in table: everyone due in today (by working hours) and anyone else who logged today. */
export async function teacherSignIns(db: DbOrTx, today: string) {
  const [due, logs] = await Promise.all([
    db.select({ id: teacher.id, name: teacher.name }).from(teacher).innerJoin(teacherHours, eq(teacherHours.teacherId, teacher.id))
      .where(and(isNull(teacher.deletedAt), inArray(teacher.status, ['Employed', 'Volunteer']), eq(teacherHours.weekday, weekdayOf(today)))),
    db.select({ log: teacherLog, name: teacher.name }).from(teacherLog).innerJoin(teacher, eq(teacher.id, teacherLog.teacherId)).where(eq(teacherLog.date, today))
  ]);
  const ids = new Set([...due.map((t) => t.id), ...logs.map((l) => l.log.teacherId)]);
  const rows = [...ids].map((id) => {
    const l = logs.find((x) => x.log.teacherId === id);
    return { id, name: l?.name ?? due.find((t) => t.id === id)!.name, timeIn: l?.log.absent ? null : l?.log.timeIn ?? null, timeOut: l?.log.timeOut ?? null, absent: !!l?.log.absent, source: l?.log.source ?? null, loggedAt: l?.log.loggedAt ?? null };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  return { rows, signedIn: rows.filter((r) => r.timeIn).length };
}

/** Current students by year/age group (from date of birth today), split by gender. */
export async function ageGroups(db: DbOrTx, today: string) {
  const [kids, groups] = await Promise.all([
    db.select({ dob: student.dob, gender: student.gender }).from(student).where(eq(student.status, 'Current')),
    db.select().from(yearGroup).orderBy(asc(yearGroup.minAge), asc(yearGroup.sortOrder))
  ]);
  const NONE = 'No age group';
  const out = new Map<string, { group: string; boys: number; girls: number; unspecified: number }>([...groups.map((g) => g.label), NONE].map((l) => [l, { group: l, boys: 0, girls: 0, unspecified: 0 }]));
  for (const k of kids) {
    const age = ageOn(k.dob, today);
    const row = out.get((age === null ? null : groups.find((g) => age >= g.minAge && age <= g.maxAge)?.label) ?? NONE)!;
    if (k.gender === 'Male') row.boys++; else if (k.gender === 'Female') row.girls++; else row.unspecified++;
  }
  return [...out.values()].filter((r) => r.boys + r.girls + r.unspecified > 0);
}

/** The four newest unread office conversations for this admin, and how many are unread in all. */
export async function unreadMessages(db: DbOrTx, staff: { id: number; rank: string | null; isSuper: boolean }) {
  const unread = (await inbox(db, staff, { box: 'inbox' })).filter((t) => t.unread);
  return { total: unread.length, latest: unread.slice(0, 4) };
}
