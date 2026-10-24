import { eq, sql as dsql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, attendanceMark, classAssignment, fireDrill, holiday, registerSession, schoolClass, student, teacher, teacherLog, timetableSlot } from '@/db/schema';
import { hashPassword } from '@/server/auth';
import { endDrill, rollCall, setClassSafe, startDrill } from '@/server/attendance/drill';
import { absentCalendar, alertCandidates, attendanceStats, doubleEntries, fixDoubleEntries } from '@/server/attendance/reports';
import { decideMarks, deleteEntries, expectedSessions, markAbsent, monthGrid, registerStatus, saveRegister, weekdayOf } from '@/server/attendance/registers';
import { createHolidayRequest, createNotice, respondToRequest } from '@/server/attendance/requests';
import { bulkUpdate } from '@/server/people/students';
import { createKiosk, kioskSignIn, pendingLogs, saveLogs, signInOrOut } from '@/server/attendance/teacher-logs';
import { db, makeStaff, resetDb } from './helpers';
import { setSetting } from './setting-helper';

beforeEach(resetDb);
afterAll(() => sql.end());

// Mondays in autumn 2026: 5, 12, 19, 26 Oct. School days default Mon–Thu.
async function setup(n = 3) {
  const { actor } = await makeStaff({ isSuper: true });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Register Class' }).returning();
  await db.insert(timetableSlot).values({ classId: c!.id, weekday: 1, startTime: '17:00', durationMinutes: 120, takesRegister: true });
  const kids = [];
  for (let i = 0; i < n; i++) {
    const [s] = await db.insert(student).values({ firstName: `Kid${i}`, surname: 'Reg', status: 'Current' }).returning();
    await db.insert(classAssignment).values({ studentId: s!.id, classId: c!.id, fromDate: '2026-09-01' });
    kids.push(s!);
  }
  return { actor, year: y!, cls: c!, kids };
}
const reg = (classId: number, date: string, marks: object[]) => ({ classId, date, startTime: '17:00', marks });

describe('expected registers', () => {
  it('follow the timetable, skip holidays and non-school days', async () => {
    const { cls, year } = await setup();
    expect(weekdayOf('2026-10-05')).toBe(1);
    expect(await expectedSessions(db, cls.id, '2026-10-05')).toHaveLength(1);
    expect(await expectedSessions(db, cls.id, '2026-10-06')).toHaveLength(0); // no Tuesday slot
    await db.insert(holiday).values({ academicYearId: year.id, title: 'Half term', startsOn: '2026-10-26', endsOn: '2026-10-30' });
    expect(await expectedSessions(db, cls.id, '2026-10-26')).toHaveLength(0);
    await db.insert(timetableSlot).values({ classId: cls.id, weekday: 6, startTime: '10:00', durationMinutes: 60 });
    expect(await expectedSessions(db, cls.id, '2026-10-10')).toHaveLength(0); // Saturday isn't a school day by default
  });
});

describe('taking a register', () => {
  it('saves marks, re-saves in place, and reports status', async () => {
    const { actor, cls, kids, year } = await setup();
    expect((await registerStatus(db, year.id, '2026-10-05'))[0]?.status).toBe('Not taken');
    const r = await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'present' }, { studentId: kids[1]!.id, mark: 'late', lateMinutes: '10' }, { studentId: kids[2]!.id, mark: 'absent', notified: true }]));
    expect(r.ok).toBe(true);
    await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[2]!.id, mark: 'present' }]));
    expect(await db.select().from(attendanceMark)).toHaveLength(3);
    expect(await db.select().from(registerSession)).toHaveLength(1);
    expect((await registerStatus(db, year.id, '2026-10-05'))[0]?.status).toBe('Complete');
  });

  it('refuses students outside the class and duplicates', async () => {
    const { actor, cls, kids } = await setup();
    const [other] = await db.insert(student).values({ firstName: 'Out', surname: 'Sider' }).returning();
    expect(await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: other!.id, mark: 'present' }]))).toMatchObject({ ok: false });
    expect(await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'present' }, { studentId: kids[0]!.id, mark: 'absent' }]))).toMatchObject({ ok: false });
    // A student who joined later isn't on earlier registers.
    await db.update(classAssignment).set({ fromDate: '2026-10-10' }).where(eq(classAssignment.studentId, kids[1]!.id));
    expect(await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[1]!.id, mark: 'present' }]))).toMatchObject({ ok: false });
  });

  it('in DfE mode every mark needs a real code', async () => {
    const { actor, cls, kids } = await setup(1);
    await setSetting(actor, 'register', { type: 'dfe', orderBy: 'firstName' });
    expect(await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'present' }]))).toMatchObject({ ok: false });
    expect(await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'present', code: '??' }]))).toMatchObject({ ok: false });
    expect((await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'absent', code: 'I' }]))).ok).toBe(true);
    const g = await monthGrid(db, cls.id, '2026-10');
    expect(g.rows[0]?.cells['2026-10-05']?.[0]?.letter).toBe('I');
    expect(g.rows[0]?.summary).toMatchObject({ absentAuthorised: 1 });
  });
});

describe('month grid and decisions', () => {
  it('shows letters, % per student and the unvalidated list; decisions only touch absences and lates', async () => {
    const { actor, cls, kids } = await setup(2);
    await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'present' }, { studentId: kids[1]!.id, mark: 'absent', notified: true }]));
    await saveRegister(db, actor, reg(cls.id, '2026-10-12', [{ studentId: kids[0]!.id, mark: 'late', lateMinutes: '5' }, { studentId: kids[1]!.id, mark: 'present' }]));
    const g = await monthGrid(db, cls.id, '2026-10');
    expect(g.days.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(g.rows.find((r) => r.id === kids[1]!.id)?.cells['2026-10-05']?.[0]?.letter).toBe('N');
    expect(g.rows.find((r) => r.id === kids[0]!.id)?.summary).toMatchObject({ standardPct: 100, strictPct: 50 });
    expect(g.unvalidated).toHaveLength(2);
    const all = (await db.select().from(attendanceMark)).map((m) => m.id);
    expect(await decideMarks(db, actor, { markIds: all, authorised: 'yes', note: 'Dentist' })).toEqual({ ok: true, n: 2 });
    expect((await monthGrid(db, cls.id, '2026-10')).rows.find((r) => r.id === kids[1]!.id)?.cells['2026-10-05']?.[0]?.letter).toBe('A');
    expect((await db.select().from(attendanceMark).where(eq(attendanceMark.mark, 'present'))).every((m) => m.authorised === null)).toBe(true);
  });

  it('mark students absent fills each expected register in the range, honouring weekdays', async () => {
    const { actor, cls, kids } = await setup(1);
    await db.insert(timetableSlot).values({ classId: cls.id, weekday: 3, startTime: '17:00', durationMinutes: 60 });
    const r = await markAbsent(db, actor, { studentId: kids[0]!.id, from: '2026-10-05', to: '2026-10-18', weekdays: ['1'], authorised: 'yes', note: 'Family visit' });
    expect(r).toEqual({ ok: true, n: 2 }); // Mondays 5 and 12 only
    expect(await markAbsent(db, actor, { studentId: kids[0]!.id, from: '2026-10-10', to: '2026-10-01' })).toMatchObject({ ok: false });
  });

  it('deleting entries removes marks and leaves no empty registers', async () => {
    const { actor, cls, kids } = await setup(2);
    await saveRegister(db, actor, reg(cls.id, '2026-10-05', kids.map((k) => ({ studentId: k.id, mark: 'present' }))));
    expect(await deleteEntries(db, actor, { from: '2026-10-01', to: '2026-10-31', studentIds: [kids[0]!.id] })).toEqual({ ok: true, n: 1 });
    expect(await db.select().from(registerSession)).toHaveLength(1);
    expect(await deleteEntries(db, actor, { from: '2026-10-01', to: '2026-10-31', classId: cls.id })).toEqual({ ok: true, n: 1 });
    expect(await db.select().from(registerSession)).toHaveLength(0);
  });

  it('marking students left can delete only the register entries after the left date', async () => {
    const { actor, cls, kids } = await setup(2);
    for (const d of ['2026-10-05', '2026-10-12']) await saveRegister(db, actor, reg(cls.id, d, kids.map((k) => ({ studentId: k.id, mark: 'present' }))));
    expect(await bulkUpdate(db, actor, [kids[0]!.id], { action: 'status', status: 'Relocated/Left', leftDate: '2026-10-05', deleteRegister: 'on' })).toEqual({ ok: true, n: 1 });
    const left = await db.select().from(attendanceMark).where(eq(attendanceMark.studentId, kids[0]!.id));
    expect(left).toHaveLength(1);
    expect(await db.select().from(attendanceMark).where(eq(attendanceMark.studentId, kids[1]!.id))).toHaveLength(2);
    // Without the option nothing is deleted.
    await bulkUpdate(db, actor, [kids[1]!.id], { action: 'status', status: 'Relocated/Left', leftDate: '2026-10-05' });
    expect(await db.select().from(attendanceMark).where(eq(attendanceMark.studentId, kids[1]!.id))).toHaveLength(2);
  });
});

describe('parents and holiday requests', () => {
  it('accepting a holiday request marks the child absent on each expected register', async () => {
    const { actor, kids } = await setup(1);
    const r = await createHolidayRequest(db, null, { studentIds: [kids[0]!.id], startsOn: '2026-10-05', endsOn: '2026-10-13', request: 'Family wedding abroad' });
    if (!r.ok) throw new Error();
    expect(await respondToRequest(db, actor, r.id, { action: 'accept-authorised', response: 'Enjoy the wedding' })).toEqual({ ok: true, marked: 2 });
    const marks = await db.select().from(attendanceMark);
    expect(marks.every((m) => m.mark === 'absent' && m.authorised === true && m.note === `Holiday request #${r.id}`)).toBe(true);
  });

  it('declining marks nothing; notices must be for today or later', async () => {
    const { actor, kids } = await setup(1);
    const r = await createHolidayRequest(db, null, { studentIds: [kids[0]!.id], startsOn: '2026-10-05', endsOn: '2026-10-05', request: 'Trip' });
    if (!r.ok) throw new Error();
    expect(await respondToRequest(db, actor, r.id, { action: 'decline' })).toEqual({ ok: true, marked: 0 });
    expect(await createNotice(db, null, { studentId: kids[0]!.id, kind: 'absent', date: '2020-01-01' })).toMatchObject({ ok: false });
    expect(await createNotice(db, null, { studentId: kids[0]!.id, kind: 'late', date: '2099-01-01', expectedArrival: '17:20' })).toMatchObject({ ok: true });
  });
});

describe('reports', () => {
  it('stats, absent calendar and alerts agree on the same marks', async () => {
    const { actor, cls, kids } = await setup(2);
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) await saveRegister(db, actor, reg(cls.id, d, [{ studentId: kids[0]!.id, mark: 'present' }, { studentId: kids[1]!.id, mark: 'absent', authorised: 'no' }]));
    const stats = await attendanceStats(db, { from: '2026-10-01', to: '2026-10-31', below: 50 });
    expect(stats.map((s) => s.student?.firstName)).toEqual(['Kid1']);
    const cal = await absentCalendar(db, '2026-10');
    expect(cal.find((d) => d.date === '2026-10-05')?.classes[0]).toMatchObject({ unauthorised: 1, authorised: 0 });
    await setSetting(actor, 'alerts', { enabled: 'on', thresholdPct: '90', absences: '3', lates: '3', intervalDays: '28' });
    const alerts = await alertCandidates(db, '2026-10-20');
    expect(alerts.low.map((a) => a.student.firstName)).toEqual(['Kid1']);
    expect(alerts.low[0]?.reasons.join(' ')).toMatch(/0\.0%.*3 absences/);
  });

  it('finds and fixes double entries across two classes at the same time', async () => {
    const { actor, cls, kids, year } = await setup(1);
    const [c2] = await db.insert(schoolClass).values({ academicYearId: year.id, name: 'Second Class' }).returning();
    await db.insert(timetableSlot).values({ classId: c2!.id, weekday: 1, startTime: '17:00', durationMinutes: 60 });
    await db.insert(classAssignment).values({ studentId: kids[0]!.id, classId: c2!.id, fromDate: '2026-09-01' });
    await saveRegister(db, actor, reg(cls.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'present' }]));
    await saveRegister(db, actor, reg(c2!.id, '2026-10-05', [{ studentId: kids[0]!.id, mark: 'absent' }]));
    expect(await doubleEntries(db)).toHaveLength(1);
    expect(await fixDoubleEntries(db, actor)).toBe(1);
    expect(await doubleEntries(db)).toHaveLength(0);
  });
});

describe('teacher logs and kiosk', () => {
  it('validates logs and lists pending days from working hours', async () => {
    const { actor } = await setup(0);
    const [t] = await db.insert(teacher).values({ name: 'Log Teacher' }).returning();
    expect(await saveLogs(db, actor, [{ teacherId: t!.id, date: '2026-10-05', timeIn: '18:00', timeOut: '17:00' }])).toMatchObject({ ok: false });
    expect(await saveLogs(db, actor, [{ teacherId: t!.id, date: '2026-10-05', timeIn: '17:00', timeOut: '19:00' }])).toEqual({ ok: true, n: 1 });
    await db.execute(dsql`insert into teacher_hours (teacher_id, weekday, start_time, end_time) values (${t!.id}, 1, '17:00', '19:00')`);
    const pending = await pendingLogs(db, '2026-10-05', '2026-10-13');
    expect(pending.map((p) => p.date)).toEqual(['2026-10-12']);
  });

  it('signs in then out, then refuses a third time', async () => {
    const [t] = await db.insert(teacher).values({ name: 'Clock Teacher' }).returning();
    const at = (h: string) => new Date(`2026-10-05T${h}:00Z`); // BST: shown an hour later
    expect(await signInOrOut(db, t!.id, 'portal', at('16:02'))).toMatchObject({ ok: true, did: 'in', time: '17:02' });
    expect(await signInOrOut(db, t!.id, 'portal', at('18:31'))).toMatchObject({ ok: true, did: 'out', time: '19:31' });
    expect((await signInOrOut(db, t!.id, 'portal', at('18:40'))).ok).toBe(false);
    expect((await db.select().from(teacherLog))[0]).toMatchObject({ timeIn: '17:02:00', timeOut: '19:31:00' });
  });

  it('kiosk needs a registered device and the PIN, and locks after five wrong PINs', async () => {
    const { actor } = await setup(0);
    const [t] = await db.insert(teacher).values({ name: 'Kiosk Teacher', kioskPinHash: await hashPassword('2468') }).returning();
    expect((await kioskSignIn(db, 'not-a-device', t!.id, '2468')).ok).toBe(false);
    const k = await createKiosk(db, actor, 'Front desk');
    if (!k.ok) throw new Error();
    const now = new Date('2026-10-05T16:00:00Z');
    for (let i = 0; i < 5; i++) expect((await kioskSignIn(db, k.token, t!.id, '0000', now)).ok).toBe(false);
    expect(await kioskSignIn(db, k.token, t!.id, '2468', now)).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
    const later = new Date('2026-10-05T16:20:00Z');
    expect(await kioskSignIn(db, k.token, t!.id, '2468', later)).toMatchObject({ ok: true, did: 'in', name: 'Kiosk Teacher' });
  });
});

describe('fire drill', () => {
  it('one drill at a time; roll call uses today’s register; ending saves the report', async () => {
    const { actor, cls, kids, year } = await setup(2);
    const today = new Date().toISOString().slice(0, 10);
    const d1 = await startDrill(db, actor);
    const d2 = await startDrill(db, actor);
    expect(d2.id).toBe(d1.id);
    await expect(db.insert(fireDrill).values({ startedByName: 'x' })).rejects.toThrow();
    let call = await rollCall(db, year.id, today);
    expect(call.classes[0]).toMatchObject({ registerTaken: false, onRoll: 2 });
    const [s] = await db.insert(registerSession).values({ classId: cls.id, date: today, startTime: '17:00', takenAt: new Date() }).returning();
    await db.insert(attendanceMark).values([{ sessionId: s!.id, studentId: kids[0]!.id, mark: 'present' }, { sessionId: s!.id, studentId: kids[1]!.id, mark: 'absent' }]);
    call = await rollCall(db, year.id, today);
    expect(call.classes[0]?.students.map((x) => x.id)).toEqual([kids[0]!.id]);
    await setClassSafe(db, d1.id, cls.id, true);
    const report = await endDrill(db, actor, d1.id, year.id);
    expect(report?.classes[0]).toMatchObject({ safe: true });
    expect((await db.select().from(fireDrill))[0]?.endedAt).toBeTruthy();
  });
});
