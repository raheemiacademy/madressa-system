import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { attendanceMark, classAssignment, schoolClass, student } from '@/db/schema';
import { classify, summarise } from '@/lib/attendance';
import { audit } from '../audit';
import { readTab } from '../settings';
import { addDays, codeMap, datesBetween, expectedSessions, marksBetween, monthRange, studentSummaries } from './registers';
import type { Actor } from '../people/common';

/** Absent Calendar: per day and class, authorised absences, unauthorised absences and unauthorised lates. */
export async function absentCalendar(db: DbOrTx, month: string, classId?: number) {
  const { from, to } = monthRange(month);
  const [marks, codes, classes] = await Promise.all([marksBetween(db, from, to, { classId }), codeMap(db), db.select({ id: schoolClass.id, name: schoolClass.name }).from(schoolClass)]);
  const days = datesBetween(from, to).map((date) => {
    const rows = new Map<number, { authorised: number; unauthorised: number; lates: number; counted: number; onTime: number }>();
    for (const m of marks.filter((x) => x.date === date)) {
      const c = classify(m, codes);
      if (!c.counted) continue;
      const r = rows.get(m.classId) ?? { authorised: 0, unauthorised: 0, lates: 0, counted: 0, onTime: 0 };
      r.counted++;
      if (c.onTime) r.onTime++;
      if (c.absent && !c.late) { if (c.authorised === true) r.authorised++; else r.unauthorised++; }
      if (c.late && c.authorised !== true) r.lates++;
      rows.set(m.classId, r);
    }
    return { date, classes: [...rows].map(([id, r]) => ({ id, name: classes.find((c) => c.id === id)?.name ?? '', ...r, punctuality: r.counted ? Math.round((r.onTime / r.counted) * 1000) / 10 : null })) };
  });
  return days;
}

/** Attendance Stats: per student totals over a range, optionally one class, filtered above or below a percentage. */
export async function attendanceStats(db: DbOrTx, opts: { from: string; to: string; classId?: number; below?: number; above?: number }) {
  const { summaries } = await studentSummaries(db, opts.from, opts.to, opts.classId);
  const ids = summaries.map((s) => s.studentId);
  const names = ids.length ? await db.select({ id: student.id, firstName: student.firstName, surname: student.surname,
    classes: sql<string | null>`(select string_agg(c.name, ', ') from class_assignment a join school_class c on c.id = a.class_id where a.student_id = "student"."id" and a.to_date is null)` })
    .from(student).where(inArray(student.id, ids)) : [];
  return summaries.map((s) => ({ ...s, student: names.find((n) => n.id === s.studentId) }))
    .filter((r) => r.student && (opts.below === undefined || (r.summary.standardPct ?? 100) < opts.below) && (opts.above === undefined || (r.summary.standardPct ?? 0) > opts.above))
    .sort((a, b) => (a.summary.standardPct ?? 0) - (b.summary.standardPct ?? 0) || a.student!.surname.localeCompare(b.student!.surname));
}

/** Daily Summary / Daily Present / Daily Sessions Attendance: each class's registers on one date. */
export async function dailySummary(db: DbOrTx, date: string, yearId: number) {
  const [classes, marks, codes] = await Promise.all([
    db.select().from(schoolClass).where(eq(schoolClass.academicYearId, yearId)).orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
    marksBetween(db, date, date), codeMap(db)
  ]);
  const out = [];
  for (const c of classes) {
    const sessions = await expectedSessions(db, c.id, date);
    const onRoll = (await db.select({ n: sql<number>`count(*)::int` }).from(classAssignment).where(and(eq(classAssignment.classId, c.id), lte(classAssignment.fromDate, date), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, date)))))[0]?.n ?? 0;
    const mine = marks.filter((m) => m.classId === c.id);
    const s = summarise(mine, codes);
    out.push({ classId: c.id, name: c.name, times: sessions.map((x) => x.startTime.slice(0, 5)), onRoll, marked: mine.length, ...s });
  }
  return out;
}

/** Double Entries: the same student marked in two registers at the same date and start time (e.g. two classes). */
export const doubleEntries = (db: DbOrTx) => db.execute<{ student_id: number; name: string; date: string; start_time: string; mark_ids: number[]; classes: string[] }>(sql`
  select m.student_id, s.first_name || ' ' || s.surname as name, r.date::text as date, r.start_time::text as start_time,
    array_agg(m.id order by m.updated_at desc, m.id desc) as mark_ids, array_agg(c.name order by m.updated_at desc, m.id desc) as classes
  from attendance_mark m join register_session r on r.id = m.session_id join student s on s.id = m.student_id join school_class c on c.id = r.class_id
  group by m.student_id, s.first_name, s.surname, r.date, r.start_time having count(*) > 1 order by r.date desc, name`);

/** Keeps the most recently updated mark in each double and deletes the rest. */
export async function fixDoubleEntries(db: Db, actor: Actor) {
  const rows = await doubleEntries(db);
  const extra = rows.flatMap((r) => r.mark_ids.slice(1));
  if (!extra.length) return 0;
  await db.transaction(async (tx) => {
    await tx.delete(attendanceMark).where(inArray(attendanceMark.id, extra));
    await audit(tx, actor, { action: `Deleted ${extra.length === 1 ? '1 duplicate register entry' : `${extra.length} duplicate register entries`}`, page: 'Double entries', entity: 'attendance_mark', details: { ids: extra } });
  });
  return extra.length;
}

/** Attendance Alerts: who crosses the thresholds over the look-back window ending today. */
export async function alertCandidates(db: DbOrTx, today: string) {
  const s = await readTab(db, 'alerts');
  const from = addDays(today, -Number(s.intervalDays) + 1);
  const { summaries } = await studentSummaries(db, from, today);
  const ids = summaries.map((x) => x.studentId);
  const names = ids.length ? await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).where(inArray(student.id, ids)) : [];
  const low = [], high = [];
  for (const r of summaries) {
    const st = names.find((n) => n.id === r.studentId);
    if (!st || st.status !== 'Current') continue;
    const reasons = [];
    if (r.summary.standardPct !== null && r.summary.standardPct < Number(s.thresholdPct)) reasons.push(`attendance ${r.summary.standardPct.toFixed(1)}%`);
    if (r.summary.absent >= Number(s.absences)) reasons.push(`${r.summary.absent} absences`);
    if (r.summary.late >= Number(s.lates)) reasons.push(`${r.summary.late} lates`);
    if (reasons.length) low.push({ student: st, summary: r.summary, reasons });
    else if (s.highAttendance && r.summary.standardPct !== null && r.summary.standardPct >= Number(s.highPct)) high.push({ student: st, summary: r.summary });
  }
  return { settings: s, from, low, high };
}

