import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, auditLog, loginIdentity, session, setting } from '@/db/schema';
import { deleteYear, saveYear, setCurrentYear } from '@/server/academic-years';
import { createSession, validateSession } from '@/server/auth';
import { decrypt } from '@/server/crypto';
import { saveHoliday } from '@/server/holidays';
import { saveProfile } from '@/server/profile';
import { readTab, saveTab } from '@/server/settings';
import { deleteStaff, saveStaff } from '@/server/staff';
import { addNote, deleteNote, updateNote } from '@/server/sticky-notes';
import { formToValues, tabByKey, tabSchema, TABS } from '@/settings/tabs';
import { db, makeStaff, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => sql.end());

const audits = () => db.select().from(auditLog);
const staffForm = (o: Record<string, string> = {}) => ({ name: 'Sample Staff B', email: 'staff.b@example.org', password: 'a long password', allowLogin: 'on', ...o });

describe('admin staff', () => {
  it('creates a login and audits without the password', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const r = await saveStaff(db, actor, staffForm({ canEdit: 'on' }));
    expect(r.ok).toBe(true);
    const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.email, 'staff.b@example.org'));
    expect(idn?.passwordHash).toMatch(/^\$argon2id\$/);
    const a = await audits();
    expect(a).toHaveLength(1);
    expect(JSON.stringify(a[0])).not.toContain('a long password');
    expect(a[0]!.details).toMatchObject({ accessLevels: ['canEdit'], passwordChanged: true });
  });

  it('rejects a duplicate email and a short password', async () => {
    const { actor, staff } = await makeStaff({ isSuper: true });
    expect(await saveStaff(db, actor, staffForm({ email: staff.email.toUpperCase() }))).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
    expect(await saveStaff(db, actor, staffForm({ password: 'short' }))).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
  });

  it('won’t let the only super admin remove their own super access or delete themselves', async () => {
    const { actor, staff } = await makeStaff({ isSuper: true, email: 'only@example.org' });
    expect(await saveStaff(db, actor, staffForm({ email: 'only@example.org', password: '' }), staff.id)).toMatchObject({ ok: false, errors: { isSuper: expect.any(String) } });
    expect((await deleteStaff(db, actor, staff.id)).ok).toBe(false);
  });

  it('signs a person out everywhere when their password changes or login is turned off', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const other = await makeStaff({ name: 'Other Admin' });
    const { token } = await createSession(db, other.identity.id, 'admin');
    await saveStaff(db, actor, staffForm({ email: other.staff.email, password: 'brand new password' }), other.staff.id);
    expect(await validateSession(db, 'admin', token)).toBeNull();
    const second = await createSession(db, other.identity.id, 'admin');
    await saveStaff(db, actor, staffForm({ email: other.staff.email, password: '', allowLogin: '' }), other.staff.id);
    expect(await validateSession(db, 'admin', second.token)).toBeNull();
  });

  it('deleting staff removes their login and sessions', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const other = await makeStaff({ name: 'Leaving Admin' });
    await createSession(db, other.identity.id, 'admin');
    expect((await deleteStaff(db, actor, other.staff.id)).ok).toBe(true);
    expect(await db.select().from(loginIdentity).where(eq(loginIdentity.id, other.identity.id))).toHaveLength(0);
    expect(await db.select().from(session)).toHaveLength(0);
  });
});

describe('academic years', () => {
  const year = (title: string, startsOn: string, endsOn: string, makeCurrent = '') => ({ title, startsOn, endsOn, makeCurrent });

  it('keeps exactly one current year', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const a = await saveYear(db, actor, year('2025/26', '2025-09-01', '2026-07-31', 'on'));
    const b = await saveYear(db, actor, year('2026/27', '2026-09-01', '2027-07-31', 'on'));
    expect(a.ok && b.ok).toBe(true);
    let cur = await db.select().from(academicYear).where(eq(academicYear.isCurrent, true));
    expect(cur.map((y) => y.title)).toEqual(['2026/27']);
    if (a.ok) await setCurrentYear(db, actor, a.id);
    cur = await db.select().from(academicYear).where(eq(academicYear.isCurrent, true));
    expect(cur.map((y) => y.title)).toEqual(['2025/26']);
  });

  it('the database itself refuses two current years', async () => {
    await db.insert(academicYear).values({ title: 'A', startsOn: '2020-09-01', endsOn: '2021-07-31', isCurrent: true });
    await expect(db.insert(academicYear).values({ title: 'B', startsOn: '2021-09-01', endsOn: '2022-07-31', isCurrent: true })).rejects.toThrow();
  });

  it('rejects overlapping, backwards and impossible dates', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    await saveYear(db, actor, year('2026/27', '2026-09-01', '2027-07-31'));
    expect(await saveYear(db, actor, year('Overlap', '2027-07-01', '2028-07-31'))).toMatchObject({ ok: false, errors: { startsOn: expect.stringMatching(/overlap/) } });
    expect(await saveYear(db, actor, year('Back', '2030-09-01', '2030-01-01'))).toMatchObject({ ok: false, errors: { endsOn: expect.any(String) } });
    expect(await saveYear(db, actor, year('Bad', '2031-02-30', '2031-07-01'))).toMatchObject({ ok: false, errors: { startsOn: expect.any(String) } });
  });

  it('won’t delete the current year or a year with holidays', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const cur = await saveYear(db, actor, year('2026/27', '2026-09-01', '2027-07-31', 'on'));
    const old = await saveYear(db, actor, year('2025/26', '2025-09-01', '2026-07-31'));
    if (!cur.ok || !old.ok) throw new Error('setup');
    expect((await deleteYear(db, actor, cur.id)).ok).toBe(false);
    await saveHoliday(db, actor, { academicYearId: old.id, title: 'Half term', startsOn: '2025-10-27', endsOn: '2025-10-31', description: '' });
    expect(await deleteYear(db, actor, old.id)).toMatchObject({ ok: false, error: expect.stringMatching(/1 holiday\b/) });
  });
});

describe('holidays', () => {
  it('must fall inside its academic year', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const y = await saveYear(db, actor, { title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31' });
    if (!y.ok) throw new Error('setup');
    const base = { academicYearId: y.id, title: 'Eid', description: '' };
    expect(await saveHoliday(db, actor, { ...base, startsOn: '2027-08-01', endsOn: '2027-08-03' })).toMatchObject({ ok: false });
    expect(await saveHoliday(db, actor, { ...base, startsOn: '2027-03-20', endsOn: '2027-03-19' })).toMatchObject({ ok: false, errors: { endsOn: expect.any(String) } });
    expect(await saveHoliday(db, actor, { ...base, startsOn: '2027-03-20', endsOn: '2027-03-22', showParent: 'on' })).toMatchObject({ ok: true });
  });
});

describe('settings framework (§4)', () => {
  it('every tab has working defaults', () => {
    for (const t of TABS) expect(() => tabSchema(t).parse({})).not.toThrow();
  });

  it('validates fees settings: sort code, account number and reference variables', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const tab = tabByKey('fees')!;
    const fd = new FormData();
    fd.set('admissionFee', '25.50'); fd.set('bankSortCode', '12-34-5'); fd.set('bankAccountNumber', '1234'); fd.set('bankReference', 'FEES-{STUDENT_ID}');
    const r = await saveTab(db, actor, tab, formToValues(tab, fd));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['bankAccountNumber', 'bankReference', 'bankSortCode']);
    fd.set('bankSortCode', '12-34-56'); fd.set('bankAccountNumber', '12345678'); fd.set('bankReference', 'MADRASAH-{DATE_YMD}-S{STUDENT_IDS}');
    expect((await saveTab(db, actor, tab, formToValues(tab, fd))).ok).toBe(true);
    expect((await readTab(db, 'fees')).admissionFee).toBe(2550);
  });

  it('rejects javascript: links and bad money', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const tab = tabByKey('studentPortal')!;
    const fd = new FormData();
    fd.append('customLinks.label', 'Click'); fd.append('customLinks.url', 'javascript:alert(1)'); fd.append('customLinks.icon', 'link');
    expect((await saveTab(db, actor, tab, formToValues(tab, fd))).ok).toBe(false);
    const fees = tabByKey('fees')!;
    const f2 = new FormData(); f2.set('admissionFee', '12.345');
    expect(await saveTab(db, actor, fees, formToValues(fees, f2))).toMatchObject({ ok: false, errors: { admissionFee: expect.stringMatching(/amount/) } });
  });

  it('encrypts secrets, keeps them when left blank, and never audits their value', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const tab = tabByKey('mail')!;
    await saveTab(db, actor, tab, formToValues(tab, new FormData()), { password: 'smtp-secret-123' });
    const [row] = await db.select().from(setting).where(eq(setting.tab, 'mail'));
    expect(JSON.stringify(row?.value)).not.toContain('smtp-secret-123');
    const stored = (await readTab(db, 'mail')).password as { enc: string };
    expect(decrypt(stored.enc)).toBe('smtp-secret-123');
    await saveTab(db, actor, tab, formToValues(tab, new FormData()), { password: '' });
    expect(decrypt(((await readTab(db, 'mail')).password as { enc: string }).enc)).toBe('smtp-secret-123');
    const a = await audits();
    expect(JSON.stringify(a)).not.toContain('smtp-secret-123');
    expect(a[0]!.details).toEqual({ changed: ['password'] });
  });

  it('stores messaging routes as booleans', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const tab = tabByKey('messaging')!;
    const fd = new FormData(); fd.set('studentsToTeachers', 'on');
    await saveTab(db, actor, tab, formToValues(tab, fd));
    const v = await readTab(db, 'messaging');
    expect(v.studentsToTeachers).toBe(true);
    expect(v.teachersToAdmins).toBe(false); // unticked boxes save as off
  });
});

describe('school profile', () => {
  it('requires a name and https logo URLs', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    expect(await saveProfile(db, actor, { name: '' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(await saveProfile(db, actor, { name: 'Sample Academy', logoUrl: 'http://x.example/logo.png' })).toMatchObject({ ok: false, errors: { logoUrl: expect.any(String) } });
    expect(await saveProfile(db, actor, { name: 'Sample Academy', email: 'office@example.org' })).toEqual({ ok: true });
  });
});

describe('sticky notes', () => {
  it('only the author or a super admin can change a note', async () => {
    const a = await makeStaff({ name: 'Author' });
    const b = await makeStaff({ name: 'Someone Else' });
    const sup = await makeStaff({ name: 'Super', isSuper: true });
    await addNote(db, { identityId: a.identity.id, isSuper: false }, { pagePath: '/admin', body: 'Call the printer company', colour: 'sky' });
    const notes = await db.query.stickyNote.findMany();
    const id = notes[0]!.id;
    expect((await updateNote(db, { identityId: b.identity.id, isSuper: false }, id, 'hijack')).ok).toBe(false);
    expect((await deleteNote(db, { identityId: b.identity.id, isSuper: false }, id)).ok).toBe(false);
    expect((await updateNote(db, { identityId: a.identity.id, isSuper: false }, id, 'Done')).ok).toBe(true);
    expect((await deleteNote(db, { identityId: sup.identity.id, isSuper: true }, id)).ok).toBe(true);
  });

  it('rejects pages outside the admin area and unknown colours', async () => {
    const a = await makeStaff();
    expect((await addNote(db, { identityId: a.identity.id, isSuper: false }, { pagePath: 'https://evil.example', body: 'x', colour: 'sky' })).ok).toBe(false);
    expect((await addNote(db, { identityId: a.identity.id, isSuper: false }, { pagePath: '/admin', body: 'x', colour: 'red' })).ok).toBe(false);
  });
});
