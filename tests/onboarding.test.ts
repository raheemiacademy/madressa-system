import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, adminStaff, classTeacher, contact, feeStructure, loginIdentity, mailQueue, onboarding, schoolClass, schoolProfile, session, student, studentContact, teacher } from '@/db/schema';
import { hideChecklist, invitePortalUsers, needsFirstAdmin, setUpSchool, setupProgress, skipStep } from '@/server/onboarding';
import { db, makeStaff, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => sql.end());

const form = { code: 'a-long-setup-code', school: 'Sample Madrasah', name: 'Sample Founder', email: 'Founder@Example.org', password: 'a sensible password' };

describe('first admin', () => {
  it('needs the setup code, then makes the school and a signed-in super admin, once only', async () => {
    delete process.env.SETUP_CODE;
    expect(await needsFirstAdmin(db)).toBe(true);
    expect(await setUpSchool(db, form)).toMatchObject({ ok: false, error: expect.stringContaining('SETUP_CODE') });
    process.env.SETUP_CODE = 'a-long-setup-code';
    expect(await setUpSchool(db, { ...form, code: 'guess' })).toMatchObject({ ok: false, errors: { code: expect.any(String) } });
    expect(await setUpSchool(db, { ...form, password: 'short' })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    const r = await setUpSchool(db, form);
    expect(r).toMatchObject({ ok: true, token: expect.any(String) });
    expect((await db.select().from(schoolProfile))[0]!.name).toBe('Sample Madrasah');
    const [s] = await db.select().from(adminStaff);
    expect(s).toMatchObject({ name: 'Sample Founder', email: 'founder@example.org', isSuper: true });
    expect((await db.select().from(loginIdentity))[0]).toMatchObject({ portal: 'admin', adminStaffId: s!.id, emailVerifiedAt: expect.any(Date) });
    expect(await db.select().from(session)).toHaveLength(1);
    expect(await needsFirstAdmin(db)).toBe(false);
    expect(await setUpSchool(db, { ...form, email: 'second@example.org' })).toMatchObject({ ok: false, error: expect.stringContaining('already been set up') });
    expect(await db.select().from(adminStaff)).toHaveLength(1);
  });
});

describe('setup checklist', () => {
  it('ticks each step off from real data, lets optional steps be skipped, and can be hidden', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    let p = await setupProgress(db);
    expect([p.finished, p.total, p.next?.key, p.complete]).toEqual([0, 6, 'details', false]);
    await db.insert(schoolProfile).values({ id: 1, name: 'Sample Madrasah', email: 'office@example.org', postcode: 'ZZ1 1ZZ' });
    const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
    const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Class One' }).returning();
    p = await setupProgress(db);
    expect(p.steps.map((s) => s.done)).toEqual([true, true, false, false, false, false]); // a class but no teacher yet
    const [t] = await db.insert(teacher).values({ name: 'Sample Teacher', email: 'teacher@example.org' }).returning();
    await db.insert(classTeacher).values({ classId: c!.id, teacherId: t!.id });
    await db.insert(student).values({ firstName: 'Sample', surname: 'Pupil', status: 'Current' });
    p = await setupProgress(db);
    expect(p.next?.key).toBe('fees');
    await skipStep(db, actor, 'details', true); // required steps can't be skipped
    await skipStep(db, actor, 'fees', true);
    await skipStep(db, actor, 'invite', true);
    p = await setupProgress(db);
    expect([p.finished, p.complete, p.steps.find((s) => s.key === 'fees')!.skipped]).toEqual([6, true, true]);
    await db.insert(feeStructure).values({ academicYearId: y!.id, name: 'Monthly' });
    expect((await setupProgress(db)).steps.find((s) => s.key === 'fees')).toMatchObject({ done: true, skipped: false });
    await hideChecklist(db, true);
    expect((await setupProgress(db)).hidden).toBe(true);
    await hideChecklist(db, false);
    expect((await setupProgress(db)).hidden).toBe(false);
  });

  it('invites parents of current students and active teachers, once each, and marks the step done', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const [kid] = await db.insert(student).values({ firstName: 'Sample', surname: 'Pupil', status: 'Current' }).returning();
    const [gone] = await db.insert(student).values({ firstName: 'Old', surname: 'Pupil', status: 'Finished' }).returning();
    const ps = await db.insert(contact).values([{ name: 'Parent With Email', email: 'parent.one@example.org' }, { name: 'Parent No Email' }, { name: 'Former Parent', email: 'former@example.org' }, { name: 'Emergency Only', email: 'emergency@example.org' }]).returning();
    await db.insert(studentContact).values([
      { studentId: kid!.id, contactId: ps[0]!.id, type: 'Parent' }, { studentId: kid!.id, contactId: ps[1]!.id, type: 'Parent' },
      { studentId: gone!.id, contactId: ps[2]!.id, type: 'Parent' }, { studentId: kid!.id, contactId: ps[3]!.id, type: 'Emergency' }
    ]);
    await db.insert(teacher).values([{ name: 'Teacher With Email', email: 'teacher.one@example.org' }, { name: 'Left Teacher', email: 'left@example.org', status: 'Resigned' }]);
    const first = await invitePortalUsers(db, actor);
    expect(first).toEqual({ created: 2, emailed: 2, skipped: 0 });
    expect((await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'parent'))).map((l) => l.email)).toEqual(['parent.one@example.org']);
    expect((await db.select().from(mailQueue)).map((m) => m.toEmail).sort()).toEqual(['parent.one@example.org', 'teacher.one@example.org']);
    expect((await db.select().from(onboarding))[0]!.invitedAt).toBeInstanceOf(Date);
    expect((await setupProgress(db)).steps.find((s) => s.key === 'invite')!.done).toBe(true);
    // Running it again makes no new logins; someone who has since chosen a password isn't emailed again.
    await db.update(loginIdentity).set({ passwordHash: 'set' }).where(eq(loginIdentity.email, 'teacher.one@example.org'));
    expect(await invitePortalUsers(db, actor)).toEqual({ created: 0, emailed: 1, skipped: 0 });
  });
});
