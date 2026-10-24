import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, attendanceMark, contact, invoice, loginIdentity, payment, registerSession, schoolClass, student, studentContact, teacher, teacherHours, teacherLog, yearGroup } from '@/db/schema';
import { formatChange } from '@/lib/text';
import { addDays, weekdayOf } from '@/server/attendance/registers';
import { ageGroups, attendanceFigures, change, outstandingWeekAgo, parentFigures, studentFigures, teacherSignIns } from '@/server/dashboard';
import { todayIso } from '@/server/people/common';
import { db, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => sql.end());

const today = todayIso();

describe('dashboard figures', () => {
  it('formats week-on-week changes, with "No change" at zero', () => {
    expect(formatChange(0, 'count')).toBe('No change');
    expect(formatChange(3, 'count')).toBe('+3');
    expect(formatChange(-1.5, 'pts')).toBe('−1.5 pts');
    expect(formatChange(-1250, 'pence')).toBe('−£12.50');
    expect(change(92.5, 90)).toBe(2.5);
    expect(change(92.5, null)).toBeNull();
  });

  it('counts current students, the waiting list, and joiners minus leavers this week', async () => {
    await db.insert(student).values([
      { firstName: 'Long', surname: 'Standing', status: 'Current', startDate: '2020-09-01' },
      { firstName: 'New', surname: 'Joiner', status: 'Current', startDate: addDays(today, -2) },
      { firstName: 'Newer', surname: 'Joiner', status: 'Current', startDate: today },
      { firstName: 'Just', surname: 'Left', status: 'Relocated/Left', leftDate: addDays(today, -1) },
      { firstName: 'Long', surname: 'Gone', status: 'Finished', leftDate: '2021-07-01' },
      { firstName: 'Wait', surname: 'Ing', status: 'Waiting List' }
    ]);
    expect(await studentFigures(db, today)).toEqual({ current: 3, waiting: 1, change: 1 });
  });

  it('compares attendance today with the same day last week, and is unknown with no registers', async () => {
    expect(await attendanceFigures(db, today)).toEqual({ pct: null, change: null });
    const [y] = await db.insert(academicYear).values({ title: 'Y', startsOn: '2020-09-01', endsOn: '2030-07-31', isCurrent: true }).returning();
    const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Dash' }).returning();
    const kids = await db.insert(student).values([1, 2, 3, 4].map((i) => ({ firstName: `K${i}`, surname: 'Dash', status: 'Current' as const }))).returning();
    const reg = async (date: string, marks: ('present' | 'late' | 'absent')[]) => {
      const [s] = await db.insert(registerSession).values({ classId: c!.id, date, startTime: '17:00', takenAt: new Date() }).returning();
      await db.insert(attendanceMark).values(marks.map((mark, i) => ({ sessionId: s!.id, studentId: kids[i]!.id, mark })));
    };
    await reg(addDays(today, -7), ['present', 'absent', 'absent', 'absent']); // 25%
    await reg(today, ['present', 'late', 'present', 'absent']); // 75%
    expect(await attendanceFigures(db, today)).toEqual({ pct: 75, change: 50 });
  });

  it('works out what was outstanding a week ago from what had been recorded by then', async () => {
    const [y] = await db.insert(academicYear).values({ title: 'Y', startsOn: '2020-09-01', endsOn: '2030-07-31', isCurrent: true }).returning();
    const [k] = await db.insert(student).values({ firstName: 'Fee', surname: 'Payer', status: 'Current' }).returning();
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 86_400_000);
    const [a] = await db.insert(invoice).values({ studentId: k!.id, academicYearId: y!.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 3000, createdAt: old }).returning();
    await db.insert(invoice).values({ studentId: k!.id, academicYearId: y!.id, invoiceDate: '2026-10-01', dueDate: '2026-10-07', amountPence: 2000 }); // raised this week
    await db.insert(invoice).values({ studentId: k!.id, academicYearId: y!.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 999, createdAt: old, deletedAt: old }); // gone before then
    await db.insert(payment).values([
      { invoiceId: a!.id, amountPence: 1000, receivedOn: '2026-09-02', method: 'Cash', status: 'Cleared', createdAt: old },
      { invoiceId: a!.id, amountPence: 500, receivedOn: '2026-09-03', method: 'Cash', status: 'Cleared' }, // recorded this week
      { invoiceId: a!.id, amountPence: 700, receivedOn: '2026-09-03', method: 'Card', status: 'Bounced', createdAt: old }
    ]);
    expect(await outstandingWeekAgo(db, y!.id, now)).toBe(2000);
  });

  it('counts parent contacts of current students and those who have used the portal this year', async () => {
    const [k] = await db.insert(student).values({ firstName: 'Kid', surname: 'Portal', status: 'Current' }).returning();
    const [gone] = await db.insert(student).values({ firstName: 'Old', surname: 'Portal', status: 'Finished' }).returning();
    const ps = await db.insert(contact).values([{ name: 'Active Parent' }, { name: 'Quiet Parent' }, { name: 'Last Year Parent' }, { name: 'Former Parent' }]).returning();
    await db.insert(studentContact).values([
      { studentId: k!.id, contactId: ps[0]!.id, type: 'Parent' }, { studentId: k!.id, contactId: ps[1]!.id, type: 'Parent' },
      { studentId: k!.id, contactId: ps[2]!.id, type: 'Parent' }, { studentId: gone!.id, contactId: ps[3]!.id, type: 'Parent' }
    ]);
    await db.insert(loginIdentity).values([
      { portal: 'parent', email: 'active.parent@example.org', contactId: ps[0]!.id, lastLoginAt: new Date('2026-10-01T10:00:00Z') },
      { portal: 'parent', email: 'lastyear.parent@example.org', contactId: ps[2]!.id, lastLoginAt: new Date('2026-06-01T10:00:00Z') },
      { portal: 'parent', email: 'former.parent@example.org', contactId: ps[3]!.id, lastLoginAt: new Date('2026-10-01T10:00:00Z') }
    ]);
    expect(await parentFigures(db, '2026-09-01')).toEqual({ total: 3, active: 1 });
  });

  it('lists teachers due in today plus anyone who logged, and counts sign-ins (not absences)', async () => {
    const ts = await db.insert(teacher).values([{ name: 'Bea Due' }, { name: 'Ali Due' }, { name: 'Cal Dropin' }, { name: 'Dee Absent' }, { name: 'Eve Elsewhere' }]).returning();
    const wd = weekdayOf(today);
    await db.insert(teacherHours).values([
      { teacherId: ts[0]!.id, weekday: wd, startTime: '16:00', endTime: '19:00' }, { teacherId: ts[1]!.id, weekday: wd, startTime: '16:00', endTime: '19:00' },
      { teacherId: ts[3]!.id, weekday: wd, startTime: '16:00', endTime: '19:00' }, { teacherId: ts[4]!.id, weekday: (wd % 7) + 1, startTime: '16:00', endTime: '19:00' }
    ]);
    await db.insert(teacherLog).values([
      { teacherId: ts[1]!.id, date: today, timeIn: '15:55', source: 'kiosk' },
      { teacherId: ts[2]!.id, date: today, timeIn: '16:30', timeOut: '18:00', source: 'portal' },
      { teacherId: ts[3]!.id, date: today, absent: true, source: 'admin' }
    ]);
    const r = await teacherSignIns(db, today);
    expect(r.rows.map((x) => x.name)).toEqual(['Ali Due', 'Bea Due', 'Cal Dropin', 'Dee Absent']);
    expect(r.signedIn).toBe(2);
    expect(r.rows.find((x) => x.name === 'Dee Absent')).toMatchObject({ absent: true, timeIn: null });
  });

  it('groups current students by age group and gender, keeping students without a date of birth', async () => {
    await db.insert(yearGroup).values([{ label: 'Infants', minAge: 4, maxAge: 6 }, { label: 'Juniors', minAge: 7, maxAge: 11 }]);
    const born = (age: number) => `${Number(today.slice(0, 4)) - age}-01-01`;
    await db.insert(student).values([
      { firstName: 'A', surname: 'G', status: 'Current', gender: 'Male', dob: born(5) },
      { firstName: 'B', surname: 'G', status: 'Current', gender: 'Female', dob: born(5) },
      { firstName: 'C', surname: 'G', status: 'Current', gender: 'Female', dob: born(9) },
      { firstName: 'D', surname: 'G', status: 'Current', gender: 'Unspecified' },
      { firstName: 'E', surname: 'G', status: 'Waiting List', gender: 'Male', dob: born(9) }
    ]);
    expect(await ageGroups(db, today)).toEqual([
      { group: 'Infants', boys: 1, girls: 1, unspecified: 0 },
      { group: 'Juniors', boys: 0, girls: 1, unspecified: 0 },
      { group: 'No age group', boys: 0, girls: 0, unspecified: 1 }
    ]);
    expect((await db.select().from(student).where(eq(student.status, 'Current')))).toHaveLength(4);
  });
});
