import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, auditLog, classAssignment, contact, loginIdentity, schoolClass, siblingLink, student, studentContact, teacher, timetableSlot, yearGroup } from '@/db/schema';
import { decrypt } from '@/server/crypto';
import { setSetting } from './setting-helper';
import { copyClassesToYear, copyTimings, addSlot, fixMaintenance, maintenanceReport, migrateStudents, moveStudents, saveClass } from '@/server/people/classes';
import { ageOn } from '@/server/people/common';
import { conflicts, copyAddressToStudents, massAssign, saveContact } from '@/server/people/contacts';
import { csvDate, csvIds, parseCsv, toCsv } from '@/server/people/csv';
import { parseAnswer, saveField, listFields } from '@/server/people/custom-fields';
import { applyMapping, FULL_NAME, guessMapping, usesTemplate } from '@/server/people/column-match';
import { checkRows, commitRows } from '@/server/people/imports';
import { formWindow, submitApplication } from '@/server/people/registration';
import { globalSearch } from '@/server/people/search';
import { findSiblings, saveFoundSiblings } from '@/server/people/siblings';
import { bulkUpdate, deleteStudents, getStudent, listStudents, listFilters, saveStudent } from '@/server/people/students';
import { getTeacher, saveTeacher, setHours } from '@/server/people/teachers';
import { db, makeStaff, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => sql.end());

async function setup() {
  const { actor } = await makeStaff({ isSuper: true });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [a] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Maktab 1A', capacity: 2 }).returning();
  const [b] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Maktab 2A' }).returning();
  return { actor, year: y!, a: a!, b: b! };
}
const base = (o: Record<string, unknown> = {}) => ({ firstName: 'Test', surname: 'Student', gender: 'Female', status: 'Current', ...o });
const openClasses = async (sid: number) => (await db.select().from(classAssignment).where(and(eq(classAssignment.studentId, sid), isNull(classAssignment.toDate)))).map((r) => r.classId);

describe('students', () => {
  it('creates a student with a new contact, a class, and encrypted medical notes', async () => {
    const { actor, a } = await setup();
    const r = await saveStudent(db, actor, base({ classId: String(a.id), medicalNotes: 'Peanut allergy', startDate: '2026-09-07' }),
      [{ name: 'Sample Parent A', mobile: '07700900001', type: 'Parent', relation: 'Mother', isPrimary: 'on', portalAccess: 'on' }], null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await getStudent(db, r.id);
    expect(s?.medicalNotes).toBe('Peanut allergy');
    expect(s?.medicalNotesEnc).not.toContain('Peanut');
    expect(s?.hasMedical).toBe(true);
    expect(s?.contacts[0]?.c.name).toBe('Sample Parent A');
    expect(s?.contacts[0]?.link.isPrimary).toBe(true);
    expect(await openClasses(r.id)).toEqual([a.id]);
    expect((await db.select().from(classAssignment))[0]?.fromDate).toBe('2026-09-07');
  });

  it('allows only one primary contact', async () => {
    const { actor } = await setup();
    const r = await saveStudent(db, actor, base(), [{ name: 'A', isPrimary: 'on' }, { name: 'B', isPrimary: 'on' }], null);
    expect(r).toMatchObject({ ok: false, errors: { contacts: expect.any(String) } });
    expect(await db.select().from(student)).toHaveLength(0);
  });

  it('changing class closes the old assignment and keeps history', async () => {
    const { actor, a, b } = await setup();
    const r = await saveStudent(db, actor, base({ classId: String(a.id) }), [], null);
    if (!r.ok) throw new Error();
    await saveStudent(db, actor, base({ classId: String(b.id) }), [], null, r.id);
    expect(await openClasses(r.id)).toEqual([b.id]);
    expect((await db.select().from(classAssignment).where(eq(classAssignment.studentId, r.id)))).toHaveLength(2);
  });

  it('marking a student as left closes their classes and fills the left date', async () => {
    const { actor, a } = await setup();
    const r = await saveStudent(db, actor, base({ classId: String(a.id) }), [], null);
    if (!r.ok) throw new Error();
    await saveStudent(db, actor, base({ status: 'Relocated/Left' }), [], null, r.id);
    const s = await getStudent(db, r.id);
    expect(s?.leftDate).toBeTruthy();
    expect(await openClasses(r.id)).toEqual([]);
    expect((await db.select().from(auditLog)).some((x) => x.action.includes('marked Relocated/Left'))).toBe(true);
  });

  it('removing a contact from the form unlinks it but keeps the contact record', async () => {
    const { actor } = await setup();
    const r = await saveStudent(db, actor, base(), [{ name: 'Keep Me' }, { name: 'Drop Me' }], null);
    if (!r.ok) throw new Error();
    const s = await getStudent(db, r.id);
    const keep = s!.contacts.find((c) => c.c.name === 'Keep Me')!;
    await saveStudent(db, actor, base(), [{ contactId: String(keep.c.id), type: 'Parent' }], null, r.id);
    expect((await getStudent(db, r.id))!.contacts.map((c) => c.c.name)).toEqual(['Keep Me']);
    expect(await db.select().from(contact)).toHaveLength(2);
  });

  it('student login: email must be unique and the password must be long enough', async () => {
    const { actor } = await setup();
    expect((await saveStudent(db, actor, base({ email: 'kid@example.org', password: 'long enough pw' }), [], null)).ok).toBe(true);
    expect(await saveStudent(db, actor, base({ email: 'KID@example.org', password: 'another long pw' }), [], null)).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
    expect(await saveStudent(db, actor, base({ email: 'kid2@example.org', password: 'short' }), [], null)).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    // the failed saves rolled back completely
    expect(await db.select().from(student)).toHaveLength(1);
    expect(await db.select().from(loginIdentity).where(eq(loginIdentity.portal, 'student'))).toHaveLength(1);
  });

  it('rejects a future date of birth', async () => {
    const { actor } = await setup();
    expect(await saveStudent(db, actor, base({ dob: '2999-01-01' }), [], null)).toMatchObject({ ok: false, errors: { dob: expect.any(String) } });
  });

  it('lists with filters, counts by status, and pages', async () => {
    const { actor, a } = await setup();
    for (let i = 0; i < 3; i++) await saveStudent(db, actor, base({ firstName: `Kid${i}`, classId: String(a.id), dob: '2018-03-01' }), [], null);
    await saveStudent(db, actor, base({ firstName: 'Waiting', status: 'Waiting List' }), [], null);
    await db.insert(yearGroup).values({ label: 'Juniors', minAge: 5, maxAge: 9 });
    const all = await listStudents(db, listFilters.parse({}), 2);
    expect(all.total).toBe(4);
    expect(all.rows).toHaveLength(2);
    expect(all.statusCounts.find((s) => s.status === 'Current')?.n).toBe(3);
    const none = await listStudents(db, listFilters.parse({ classId: 'none' }), 50);
    expect(none.rows.map((r) => r.firstName)).toEqual(['Waiting']);
    const inA = await listStudents(db, listFilters.parse({ classId: String(a.id), q: 'kid1' }), 50);
    expect(inA.rows.map((r) => r.firstName)).toEqual(['Kid1']);
    expect(inA.rows[0]?.yearGroup).toBe('Juniors');
  });

  it('bulk actions update status and classes, and audit once', async () => {
    const { actor, b } = await setup();
    const ids: number[] = [];
    for (let i = 0; i < 2; i++) { const r = await saveStudent(db, actor, base({ status: 'Waiting List', firstName: `W${i}` }), [], null); if (r.ok) ids.push(r.id); }
    await db.delete(auditLog);
    expect(await bulkUpdate(db, actor, ids, { action: 'activate', classId: String(b.id), date: '2026-09-14' })).toEqual({ ok: true, n: 2 });
    for (const id of ids) expect(await openClasses(id)).toEqual([b.id]);
    expect((await db.select().from(student)).every((s) => s.status === 'Current' && s.startDate === '2026-09-14')).toBe(true);
    expect(await db.select().from(auditLog)).toHaveLength(1);
    await bulkUpdate(db, actor, ids, { action: 'status', status: 'Finished', leftDate: '2027-07-20' });
    for (const id of ids) expect(await openClasses(id)).toEqual([]);
    expect(await deleteStudents(db, actor, ids)).toBe(2);
    expect(await db.select().from(student)).toHaveLength(0);
  });
});

describe('contacts', () => {
  it('finds email and mobile conflicts regardless of case and spacing', async () => {
    await db.insert(contact).values([{ name: 'A', email: 'Same@example.org', mobile: '07700 900111' }, { name: 'B', email: 'same@example.org', mobile: '07700900111' }, { name: 'C', email: 'other@example.org' }]);
    expect(await conflicts(db, 'email')).toHaveLength(1);
    expect(await conflicts(db, 'mobile')).toHaveLength(1);
  });

  it('copies a contact’s address to linked students and mass-assigns link settings', async () => {
    const { actor } = await setup();
    const r = await saveStudent(db, actor, base(), [{ name: 'Sample Parent B' }], null);
    if (!r.ok) throw new Error();
    const [c] = await db.select().from(contact);
    await saveContact(db, actor, { name: c!.name, address: '1 Test Street', postcode: 'ZZ1 1ZZ', active: 'on' }, null, c!.id);
    expect(await copyAddressToStudents(db, actor, c!.id)).toBe(1);
    expect((await getStudent(db, r.id))?.address).toBe('1 Test Street');
    expect(await massAssign(db, actor, { contactIds: [String(c!.id)], relation: 'Guardian', isPrimary: 'yes', portalAccess: 'no' })).toEqual({ ok: true });
    const [link] = await db.select().from(studentContact);
    expect(link).toMatchObject({ relation: 'Guardian', isPrimary: true, portalAccess: false });
  });

  it('parent portal login email is unique per portal but may match a teacher’s', async () => {
    const { actor } = await setup();
    expect((await saveContact(db, actor, { name: 'Dual Role', email: 'dual@example.org', password: 'long enough pw', active: 'on' }, null)).ok).toBe(true);
    expect((await saveTeacher(db, actor, { name: 'Dual Role', email: 'dual@example.org', password: 'long enough pw' }, [], null)).ok).toBe(true);
    expect(await saveContact(db, actor, { name: 'Clash', email: 'DUAL@example.org', password: 'long enough pw', active: 'on' }, null)).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
  });
});

describe('siblings', () => {
  it('finds current students who share a Parent contact, once', async () => {
    const { actor } = await setup();
    const a = await saveStudent(db, actor, base({ firstName: 'Older' }), [{ name: 'Shared Parent' }], null);
    if (!a.ok) throw new Error();
    const [p] = await db.select().from(contact);
    await saveStudent(db, actor, base({ firstName: 'Younger' }), [{ contactId: String(p!.id), type: 'Parent' }], null);
    await saveStudent(db, actor, base({ firstName: 'Unrelated' }), [{ name: 'Someone Else' }], null);
    const found = await findSiblings(db);
    expect(found).toHaveLength(1);
    await saveFoundSiblings(db, actor, found.map((f) => [f.a, f.b]));
    expect(await db.select().from(siblingLink)).toHaveLength(1);
    expect(await findSiblings(db)).toHaveLength(0);
  });
});

describe('teachers', () => {
  it('encrypts NI number, bank details and medical info, and hashes the kiosk PIN', async () => {
    const { actor } = await setup();
    const r = await saveTeacher(db, actor, { name: 'Sample Teacher', niNumber: 'qq 12 34 56 c', bankAccount: '12345678', bankSortCode: '12-34-56', medical: 'Asthma', kioskPin: '4321' },
      [{ name: 'Emergency Person', phone: '07700900222' }], null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [raw] = await db.select().from(teacher);
    expect(JSON.stringify(raw)).not.toContain('QQ123456C');
    expect(JSON.stringify(raw)).not.toContain('12345678');
    expect(raw?.kioskPinHash).toMatch(/^\$argon2id\$/);
    const t = await getTeacher(db, r.id);
    expect(t).toMatchObject({ niNumber: 'QQ123456C', bankAccount: '12345678', medical: 'Asthma', hasKioskPin: true });
    expect(t?.emergency).toHaveLength(1);
    expect(decrypt(raw!.bankSortCodeEnc!)).toBe('12-34-56');
  });

  it('rejects a bad NI number and half-filled working hours', async () => {
    const { actor } = await setup();
    expect(await saveTeacher(db, actor, { name: 'X', niNumber: '123' }, [], null)).toMatchObject({ ok: false, errors: { niNumber: expect.any(String) } });
    const r = await saveTeacher(db, actor, { name: 'Y' }, [], null);
    if (!r.ok) throw new Error();
    expect(await setHours(db, actor, [r.id], [{ weekday: 1, start: '17:00', end: '' }])).toMatchObject({ ok: false });
    expect(await setHours(db, actor, [r.id], [{ weekday: 1, start: '19:00', end: '17:00' }])).toMatchObject({ ok: false });
    expect(await setHours(db, actor, [r.id], [{ weekday: 1, start: '17:00', end: '19:00' }, { weekday: 2, start: '', end: '' }])).toEqual({ ok: true });
    expect((await getTeacher(db, r.id))?.hours).toHaveLength(1);
  });
});

describe('classes', () => {
  it('refuses a duplicate class name in the same year', async () => {
    const { actor, year } = await setup();
    expect(await saveClass(db, actor, { academicYearId: String(year.id), name: 'maktab 1a' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  });

  it('moves students: the old class ends the day before, the new one starts on the date', async () => {
    const { actor, a, b } = await setup();
    const r = await saveStudent(db, actor, base({ classId: String(a.id), startDate: '2026-09-01' }), [], null);
    if (!r.ok) throw new Error();
    expect(await moveStudents(db, actor, { fromClassId: a.id, toClassId: b.id, studentIds: [r.id], date: '2026-11-02' })).toEqual({ ok: true, n: 1 });
    const rows = await db.select().from(classAssignment).where(eq(classAssignment.studentId, r.id));
    expect(rows.find((x) => x.classId === a.id)?.toDate).toBe('2026-11-01');
    expect(rows.find((x) => x.classId === b.id)).toMatchObject({ fromDate: '2026-11-02', toDate: null });
  });

  it('copies timetable sessions to other classes, replacing theirs', async () => {
    const { actor, a, b } = await setup();
    await addSlot(db, actor, { classId: a.id }, { weekday: '1', startTime: '17:00', hours: '2', minutes: '0', takesRegister: 'on' });
    await addSlot(db, actor, { classId: b.id }, { weekday: '3', startTime: '18:00', hours: '1', minutes: '0' });
    expect(await addSlot(db, actor, { classId: b.id }, { weekday: '3', startTime: '18:00', hours: '0', minutes: '0' })).toMatchObject({ ok: false });
    await copyTimings(db, actor, { classId: a.id }, [b.id]);
    const bs = await db.select().from(timetableSlot).where(eq(timetableSlot.classId, b.id));
    expect(bs).toHaveLength(1);
    expect(bs[0]).toMatchObject({ weekday: 1, durationMinutes: 120, takesRegister: true });
  });

  it('maintenance closes classes for students who left and for finished years', async () => {
    const { actor, a } = await setup();
    const r = await saveStudent(db, actor, base({ classId: String(a.id) }), [], null);
    if (!r.ok) throw new Error();
    await db.update(student).set({ status: 'Relocated/Left', leftDate: '2026-12-01' }).where(eq(student.id, r.id)); // left without closing (e.g. old data)
    expect((await maintenanceReport(db)).leftOpen).toHaveLength(1);
    expect(await fixMaintenance(db, actor)).toBe(1);
    expect((await maintenanceReport(db)).leftOpen).toHaveLength(0);
  });

  it('new year wizard copies classes once and moves current students', async () => {
    const { actor, year, a } = await setup();
    const r = await saveStudent(db, actor, base({ classId: String(a.id) }), [], null);
    if (!r.ok) throw new Error();
    const [next] = await db.insert(academicYear).values({ title: '2027/28', startsOn: '2027-09-01', endsOn: '2028-07-31' }).returning();
    expect(await copyClassesToYear(db, actor, year.id, next!.id, { timings: true, teachers: true })).toBe(2);
    expect(await copyClassesToYear(db, actor, year.id, next!.id, { timings: true, teachers: true })).toBe(0);
    const [newB] = await db.select().from(schoolClass).where(and(eq(schoolClass.academicYearId, next!.id), eq(schoolClass.name, 'Maktab 2A')));
    expect(await migrateStudents(db, actor, year.id, next!.id, { [a.id]: newB!.id })).toBe(1);
    const rows = await db.select().from(classAssignment).where(eq(classAssignment.studentId, r.id));
    expect(rows.find((x) => x.classId === a.id)?.toDate).toBe('2027-07-31');
    expect(rows.find((x) => x.classId === newB!.id)).toMatchObject({ fromDate: '2027-09-01', toDate: null });
  });
});

describe('imports and exports', () => {
  it('reads UK dates and rejects impossible ones', () => {
    expect(csvDate('07/03/2018')).toBe('2018-03-07');
    expect(csvDate('2018-03-07')).toBe('2018-03-07');
    expect(csvDate('31/02/2018')).toBeNull();
    expect(csvDate('')).toBe('');
    expect(csvIds('12-13, 14')).toEqual([12, 13, 14]);
  });

  it('neutralises spreadsheet formulas in exports', () => {
    const csv = toCsv(['name'], [['=HYPERLINK("x")'], ['+1'], ['Normal']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`'+1`);
    expect(parseCsv(csv).rows.map((r) => r.name)).toEqual([`'=HYPERLINK("x")`, `'+1`, 'Normal']);
  });

  it('previews rows with line-numbered errors, then imports only the good ones', async () => {
    const { actor, year } = await setup();
    const { rows } = parseCsv('First Name,Surname,DOB,Class,Contact Name\nTest,One,01/02/2018,Maktab 1A,Sample Parent C\n,Two,31/02/2018,Nope,\n');
    const res = await checkRows(db, 'students', rows, year.id);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(res[1]?.line).toBe(3);
    for (const bit of ['first_name', 'dob', 'Nope']) expect(res[1]?.errors.join(' ')).toContain(bit);
    expect(await commitRows(db, actor, 'students', res, year.id)).toEqual({ added: 1, updated: 0, skipped: 1 });
    const [s] = await db.select().from(student);
    expect(s).toMatchObject({ firstName: 'Test', dob: '2018-02-01', source: 'import' });
    expect(await openClasses(s!.id)).toHaveLength(1);
    expect(await db.select().from(studentContact)).toHaveLength(1);
  });

  it('matches their own headings, then links siblings to one parent by email', async () => {
    const { actor, year } = await setup();
    const { headers, rows } = parseCsv([
      'Name,Date of Birth,Mother Name,Mother Mobile,Parent Email,Notes',
      'Test Ali Khan,01/02/2018,Sample Mum,07700 900123,Mum@Example.org,x',
      'Test Sara Khan,03/04/2019,Sample Mum,07700 900123,mum@example.org,'
    ].join('\n'));
    expect(usesTemplate('students', headers)).toBe(false);
    const m = guessMapping('students', headers);
    expect(m).toEqual({ name: FULL_NAME, date_of_birth: 'dob', mother_name: 'contact_name', mother_mobile: 'contact_mobile', parent_email: 'contact_email', notes: 'notes' });
    const res = await checkRows(db, 'students', applyMapping(rows, m), year.id);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(await commitRows(db, actor, 'students', res, year.id)).toMatchObject({ added: 2 });
    expect((await db.select().from(student)).map((s) => [s.firstName, s.surname])).toEqual([['Test Ali', 'Khan'], ['Test Sara', 'Khan']]);
    expect(await db.select().from(contact)).toHaveLength(1);
    expect(await db.select().from(studentContact)).toHaveLength(2);
  });

  it('export/import edit updates by ID instead of duplicating', async () => {
    const { actor, year } = await setup();
    const r = await saveStudent(db, actor, base(), [], null);
    if (!r.ok) throw new Error();
    const res = await checkRows(db, 'students', parseCsv(`id,first_name,surname\n${r.id},Renamed,Student\n999,Ghost,Row\n`).rows, year.id);
    expect(res.map((x) => x.ok)).toEqual([true, false]);
    await commitRows(db, actor, 'students', res, year.id);
    expect((await db.select().from(student)).map((s) => s.firstName)).toEqual(['Renamed']);
  });
});

describe('custom fields', () => {
  it('validates answers by type', async () => {
    const { actor } = await setup();
    await saveField(db, actor, { entity: 'student', label: 'Madhab', type: 'radio', options: 'Hanafi\nShafi\'i' });
    expect(await saveField(db, actor, { entity: 'student', label: 'Bad', type: 'radio', options: 'One' })).toMatchObject({ ok: false });
    const [f] = await listFields(db, 'student');
    expect(parseAnswer(f!, 'Hanafi')).toEqual({ value: 'Hanafi' });
    expect(parseAnswer(f!, 'Other')).toMatchObject({ error: expect.any(String) });
    expect(parseAnswer({ ...f!, type: 'decimal', decimals: 1 }, '1.25')).toMatchObject({ error: expect.any(String) });
    expect(parseAnswer({ ...f!, type: 'checkboxes', options: ['a', 'b'] }, ['a', 'zzz'])).toEqual({ value: ['a'] });
  });
});

describe('public registration form', () => {
  const form = (o: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: 'Sample Parent D', email: 'parent.d@example.org', mobile: '07700900333', 'child.0.firstName': 'Applicant', 'child.0.dob': '2019-05-05', 'child.0.gender': 'Male', ...o })) fd.set(k, v);
    return fd;
  };

  it('is closed until enabled, and honours the open and close times', async () => {
    expect(formWindow({ enabled: false })).toBe('disabled');
    expect(formWindow({ enabled: true, opensAt: '2026-10-25T09:00' }, new Date('2026-10-25T07:59:00Z'))).toBe('not-yet'); // 08:59 GMT
    expect(formWindow({ enabled: true, opensAt: '2026-10-25T09:00' }, new Date('2026-10-25T09:00:00Z'))).toBe('open');
    expect(formWindow({ enabled: true, closesAt: '2026-07-01T12:00' }, new Date('2026-07-01T11:00:00Z'))).toBe('closed'); // 12:00 BST
    expect((await submitApplication(db, 'child', form(), { ip: null })).ok).toBe(false);
  });

  it('creates waiting-list students with the parent as primary contact, copying the surname', async () => {
    const { actor } = await setup();
    await setSetting(actor, 'registration', { enabled: 'on', copySurname: 'on', requireMobile: 'on', requireDob: 'on' });
    const r = await submitApplication(db, 'child', form({ 'child.1.firstName': 'Second', 'child.1.dob': '2020-01-01' }), { ip: '10.2.0.1' });
    expect(r).toEqual({ ok: true, count: 2 });
    const kids = await db.select().from(student);
    expect(kids.map((k) => [k.status, k.surname, k.source])).toEqual([['Waiting List', 'D', 'form'], ['Waiting List', 'D', 'form']]);
    expect((await db.select().from(studentContact)).every((l) => l.isPrimary)).toBe(true);
  });

  it('ignores honeypot submissions and reports missing fields', async () => {
    const { actor } = await setup();
    await setSetting(actor, 'registration', { enabled: 'on', requireDob: 'on' });
    expect(await submitApplication(db, 'child', form({ website: 'spam' }), { ip: '10.2.0.2' })).toEqual({ ok: true, count: 0 });
    expect(await db.select().from(student)).toHaveLength(0);
    const r = await submitApplication(db, 'child', form({ 'child.0.dob': '', 'child.0.surname': '' }), { ip: '10.2.0.3' });
    expect(r).toMatchObject({ ok: false, errors: { 'child.0.dob': expect.any(String), 'child.0.surname': expect.any(String) } });
  });
});

describe('search and helpers', () => {
  it('finds students, contacts and teachers by name, #ID and phone', async () => {
    const { actor } = await setup();
    const r = await saveStudent(db, actor, base({ firstName: 'Findable' }), [{ name: 'Findable Parent', mobile: '07700 900444' }], null);
    if (!r.ok) throw new Error();
    await saveTeacher(db, actor, { name: 'Findable Teacher' }, [], null);
    const res = await globalSearch(db, 'findable');
    expect([res.students.length, res.contacts.length, res.teachers.length]).toEqual([1, 1, 1]);
    expect((await globalSearch(db, `#${r.id}`)).students[0]?.id).toBe(r.id);
    expect((await globalSearch(db, '07700900444')).contacts).toHaveLength(1);
  });

  it('works out age on a date', () => {
    expect(ageOn('2018-10-23', '2026-10-22')).toBe(7);
    expect(ageOn('2018-10-23', '2026-10-23')).toBe(8);
    expect(ageOn(null, '2026-10-23')).toBeNull();
  });
});
