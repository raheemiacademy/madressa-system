import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  academicYear, appLog, contact, homework, incident, invoice, loginIdentity, message, messageThread, payment, registerSession, schoolClass, student, studentContact, teacher, timetableSlot
} from '@/db/schema';
import { GET } from '@/app/api/owner/summary/route';
import { buildSummary, isPrivateAddress } from '@/server/owner/summary';
import { LATEST } from '@/lib/releases';
import { db, makeStaff, resetDb } from './helpers';

const TOKEN = 'x'.repeat(40);
const env = { OWNER_SUMMARY_TOKEN: process.env.OWNER_SUMMARY_TOKEN, APP_URL: process.env.APP_URL };
beforeAll(() => { process.env.OWNER_SUMMARY_TOKEN = TOKEN; process.env.APP_URL = 'https://demo.example.org'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

// What Next.js passes on for a request from another container: its private address, and the container's own host name.
const internal = { host: 'ma-demo:3000', 'x-forwarded-for': '172.18.0.5', 'x-forwarded-host': 'ma-demo:3000' };
const get = (headers: Record<string, string>) => GET(new Request('http://ma-demo:3000/api/owner/summary', { headers }));
const NOW = new Date('2026-10-28T12:00:00Z'); // a Wednesday; this week is Mon 26 Oct to Sun 1 Nov
const at = (iso: string) => new Date(iso);

/** A small madrasah with something in every table the summary counts, and personal details it must never send. */
async function school() {
  const [year] = await db.insert(academicYear).values({ title: '2026-27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [current, waiting] = await db.insert(student).values([
    { firstName: 'Sample', surname: 'Child', status: 'Current', mobile: '07700900001', address: '1 Sample Street', notes: 'private note' },
    { firstName: 'Waiting', surname: 'Child', status: 'Waiting List' },
    { firstName: 'Paused', surname: 'Child', status: 'On Hold' },
    { firstName: 'Moved', surname: 'Child', status: 'Relocated/Left', startDate: '2026-01-01', leftDate: '2026-10-01' },
    { firstName: 'Earlier', surname: 'Leaver', status: 'Finished', startDate: '2025-01-01', leftDate: '2026-06-01' }
  ]).returning();
  const [mum, dad, other] = await db.insert(contact).values([{ name: 'Sample Parent', email: 'parent.one@example.org' }, { name: 'Second Parent', email: 'parent.two@example.org' }, { name: 'Waiting Parent' }]).returning();
  await db.insert(studentContact).values([{ studentId: current!.id, contactId: mum!.id }, { studentId: current!.id, contactId: dad!.id }, { studentId: waiting!.id, contactId: other!.id }]);
  await db.insert(loginIdentity).values({ portal: 'parent', email: 'parent.one@example.org', passwordHash: 'x', contactId: mum!.id, lastLoginAt: at('2026-10-27T18:00:00Z') });
  const [t] = await db.insert(teacher).values([{ name: 'Sample Teacher' }, { name: 'Old Teacher', status: 'Resigned' }]).returning();
  await makeStaff({ name: 'Sample Admin', email: 'office@example.org', mobile: '07700 900002', isSuper: true });
  await makeStaff({ name: 'Fees Admin', email: 'fees@example.org', feesAccess: true });
  const [cls] = await db.insert(schoolClass).values({ academicYearId: year!.id, name: 'Hifz A' }).returning();
  // Monday and Wednesday take registers; Friday isn't a school day by default, so it isn't expected.
  const [mon] = await db.insert(timetableSlot).values([{ classId: cls!.id, weekday: 1, startTime: '17:00', durationMinutes: 60 }, { classId: cls!.id, weekday: 3, startTime: '17:00', durationMinutes: 60 }, { classId: cls!.id, weekday: 5, startTime: '17:00', durationMinutes: 60 }]).returning();
  await db.insert(registerSession).values([{ classId: cls!.id, date: '2026-10-26', startTime: '17:00', slotId: mon!.id, takenAt: at('2026-10-26T17:05:00Z') }, { classId: cls!.id, date: '2026-10-19', startTime: '17:00', takenAt: at('2026-10-19T17:05:00Z') }]);
  const [thread] = await db.insert(messageThread).values({ subject: 'Private subject' }).returning();
  await db.insert(message).values({ threadId: thread!.id, senderKind: 'contact', senderId: mum!.id, senderName: 'Sample Parent', body: 'private message body', createdAt: at('2026-10-27T09:00:00Z') });
  await db.insert(homework).values({ academicYearId: year!.id, classId: cls!.id, teacherId: t!.id, title: 'Surah practice', deadlineAt: at('2026-10-30T17:00:00Z'), createdAt: at('2026-10-02T10:00:00Z') });
  await db.insert(incident).values({ kind: 'student', studentId: current!.id, severity: 'Low', occurredAt: at('2026-10-15T17:30:00Z'), title: 'Private incident', report: 'private report' });
  await db.insert(appLog).values([
    { kind: 'parent', message: 'Signed in', at: at('2026-10-27T18:00:00Z') }, { kind: 'parent', message: 'Signed in', at: at('2026-10-20T18:00:00Z') },
    { kind: 'staff', message: 'Signed in', at: at('2026-10-01T09:00:00Z') }, { kind: 'system', message: 'Worker step “mail” failed: timeout', at: at('2026-10-28T06:00:00Z') }
  ]);
  // October: £45 invoiced, £15 paid, £30 overdue for one family. September: £20, not due yet.
  const [oct] = await db.insert(invoice).values([
    { studentId: current!.id, academicYearId: year!.id, billingContactId: mum!.id, billingName: 'Sample Parent', invoiceDate: '2026-10-05', dueDate: '2026-10-10', amountPence: 4500 },
    { studentId: current!.id, academicYearId: year!.id, billingContactId: mum!.id, invoiceDate: '2026-09-10', dueDate: '2026-11-30', amountPence: 2000 }
  ]).returning();
  await db.insert(payment).values({ invoiceId: oct!.id, amountPence: 1500, receivedOn: '2026-10-08', method: 'Cash' });
}

const keys = (o: unknown, at = ''): string[] => Array.isArray(o) ? (o.length ? keys(o[0], `${at}[].`) : [])
  : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [`${at}${k}`, ...keys(v, `${at}${k}.`)]) : [];

describe('the summary', () => {
  it('counts students, staff, parents, usage, registers, the last 8 weeks and money, as of now', async () => {
    await school();
    const s = await buildSummary(db, NOW);
    expect(s.version).toBe(LATEST.version);
    expect(s.counts).toEqual({ students: 1, teachers: 1, staff: 2, parents: 2, parentsWithLogin: 1 });
    expect(s.lastActiveAt).toBe('2026-10-27T18:00:00.000Z');
    expect(s.usage).toEqual({
      byStatus: { current: 1, waiting: 1, onHold: 1, leftThisYear: 1 }, classes: 1, logins: { last7: 1, last30: 3 },
      registersThisWeek: { taken: 1, planned: 2 }, thisMonth: { messages: 1, homework: 1, incidents: 1 }, errors24h: 1
    });
    expect(s.weeks.map((w) => w.start)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(s.weeks.at(-1)).toEqual({ start: '2026-10-26', students: 1, registers: 1, logins: 1, parentLogins: 1, messages: 1 });
    expect(s.weeks.at(-2)).toMatchObject({ registers: 1, parentLogins: 1, messages: 0 });
    expect(s.weeks[0]!.students).toBe(2); // the October leaver was still here in September
    expect(s.money).toEqual({ month: { invoiced: 4500, collected: 1500, overdue: 3000, familiesOverdue: 1 }, year: { invoiced: 6500, collected: 1500, overdue: 3000, familiesOverdue: 1 } });
    expect(s.admins).toEqual([
      { name: 'Sample Admin', email: 'office@example.org', phone: '07700 900002', access: 'Super' },
      { name: 'Fees Admin', email: 'fees@example.org', phone: null, access: 'Access fees area' }
    ]);
  });

  it('is all zeros for an empty madrasah with no school year', async () => {
    const s = await buildSummary(db, NOW);
    expect(s.counts).toEqual({ students: 0, teachers: 0, staff: 0, parents: 0, parentsWithLogin: 0 });
    expect(s.usage.registersThisWeek).toEqual({ taken: 0, planned: 0 });
    expect(s.money.year).toEqual({ invoiced: 0, collected: 0, overdue: 0, familiesOverdue: 0 });
    expect(s.weeks).toHaveLength(8);
    expect(s.admins).toEqual([]);
    expect(s.lastActiveAt).toBeNull();
  });
});

describe('GET /api/owner/summary', () => {
  it('answers a container on the private network that has the token', async () => {
    await school();
    const r = await get({ ...internal, authorization: `Bearer ${TOKEN}` });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect((await r.json()).counts.students).toBe(1);
  });

  it('never contains anything but counts, money totals and admin contacts: no child’s or parent’s details', async () => {
    await school();
    const text = await (await get({ ...internal, authorization: `Bearer ${TOKEN}` })).text();
    expect(keys(JSON.parse(text)).sort()).toEqual([
      'admins', 'admins.[].access', 'admins.[].email', 'admins.[].name', 'admins.[].phone',
      'counts', 'counts.parents', 'counts.parentsWithLogin', 'counts.staff', 'counts.students', 'counts.teachers',
      'lastActiveAt',
      'money', 'money.month', 'money.month.collected', 'money.month.familiesOverdue', 'money.month.invoiced', 'money.month.overdue',
      'money.year', 'money.year.collected', 'money.year.familiesOverdue', 'money.year.invoiced', 'money.year.overdue',
      'usage', 'usage.byStatus', 'usage.byStatus.current', 'usage.byStatus.leftThisYear', 'usage.byStatus.onHold', 'usage.byStatus.waiting',
      'usage.classes', 'usage.errors24h', 'usage.logins', 'usage.logins.last30', 'usage.logins.last7',
      'usage.registersThisWeek', 'usage.registersThisWeek.planned', 'usage.registersThisWeek.taken',
      'usage.thisMonth', 'usage.thisMonth.homework', 'usage.thisMonth.incidents', 'usage.thisMonth.messages',
      'version',
      'weeks', 'weeks.[].logins', 'weeks.[].messages', 'weeks.[].parentLogins', 'weeks.[].registers', 'weeks.[].start', 'weeks.[].students'
    ].sort());
    for (const secret of ['Child', 'Leaver', 'Sample Parent', 'Second Parent', 'Waiting Parent', 'parent.one', 'parent.two', '07700900001', 'Street', 'private', 'Sample Teacher', 'Hifz A', 'Surah'])
      expect(text).not.toContain(secret);
  });

  it('refuses a request without the token, or with the wrong one (401)', async () => {
    expect((await get(internal)).status).toBe(401);
    expect((await get({ ...internal, authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await get({ ...internal, authorization: `Bearer ${TOKEN}x` })).status).toBe(401);
  });

  it('refuses anything that came through the public address, even with the token (403)', async () => {
    const auth = { authorization: `Bearer ${TOKEN}` };
    // Through Caddy: the visitor's public address is in X-Forwarded-For.
    expect((await get({ host: 'demo.example.org', 'x-forwarded-for': '203.0.113.7', 'x-forwarded-host': 'demo.example.org', ...auth })).status).toBe(403);
    // A public address anywhere in the chain.
    expect((await get({ ...internal, 'x-forwarded-for': '172.18.0.5, 8.8.8.8', ...auth })).status).toBe(403);
    // The public web address, even from a private one.
    expect((await get({ host: 'demo.example.org', 'x-forwarded-for': '172.18.0.2', 'x-forwarded-host': 'demo.example.org', ...auth })).status).toBe(403);
  });

  it('does not exist on a copy without a token (404)', async () => {
    delete process.env.OWNER_SUMMARY_TOKEN;
    try { expect((await get({ ...internal, authorization: 'Bearer ' })).status).toBe(404); } finally { process.env.OWNER_SUMMARY_TOKEN = TOKEN; }
    process.env.OWNER_SUMMARY_TOKEN = 'too-short';
    try { expect((await get({ ...internal, authorization: 'Bearer too-short' })).status).toBe(404); } finally { process.env.OWNER_SUMMARY_TOKEN = TOKEN; }
  });

  it('knows private addresses from public ones', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.1', '192.168.1.1', '127.0.0.1', '::1', '::ffff:172.18.0.3', 'fd00::1']) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '213.32.71.244', '2001:db8::1', 'unknown', '']) expect(isPrivateAddress(ip)).toBe(false);
  });
});
