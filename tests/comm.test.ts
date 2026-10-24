import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, adminStaff, alertSent, classAssignment, classTeacher, contact, invoice, loginIdentity, mailQueue, messageThread, payment, schoolClass, smsMessage, student, studentContact, teacher } from '@/db/schema';
import { login } from '@/server/auth';
import { claimDay, runDaily } from '@/server/comm/jobs';
import { logOutbox, processMailQueue } from '@/server/comm/mail';
import { bulkThreads, compose, deleteRange, inbox, openThread, reply, routeAllowed, startFromPortal } from '@/server/comm/messages';
import { recipients, saveNewsletter, sendNewsletter } from '@/server/comm/newsletters';
import { sendReceipts, studentLeftEmails } from '@/server/comm/notify';
import { csvRecipients, groupRecipients, normaliseNumber, processSmsQueue, queueSms, smsOutbox, whatsappLink } from '@/server/comm/sms';
import { fill, getTemplate, render, saveTemplate } from '@/server/comm/templates';
import { whatsappList } from '@/server/comm/whatsapp';
import { syncPortalLogin } from '@/server/people/logins';
import { requestPasswordLink, redeemPasswordLink } from '@/server/password-links';
import { db, makeStaff, resetDb } from './helpers';
import { setSetting } from './setting-helper';

beforeEach(async () => { await resetDb(); logOutbox.length = 0; smsOutbox.length = 0; });
afterAll(() => sql.end());

async function family() {
  const { actor, staff } = await makeStaff({ isSuper: true });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Comm Class' }).returning();
  const [s] = await db.insert(student).values({ firstName: 'Kid', surname: 'Comm', status: 'Current' }).returning();
  await db.insert(classAssignment).values({ studentId: s!.id, classId: c!.id, fromDate: '2026-09-01' });
  const [p] = await db.insert(contact).values({ name: 'Parent Comm', email: 'parent.comm@example.org', mobile: '07700 900111', gender: 'Female' }).returning();
  await db.insert(studentContact).values({ studentId: s!.id, contactId: p!.id, type: 'Parent', isPrimary: true });
  const [t] = await db.insert(teacher).values({ name: 'Teacher Comm', email: 'teacher.comm@example.org', gender: 'Female', mobile: '07700 900222' }).returning();
  return { actor: { ...actor, staffId: staff.id }, staff, year: y!, cls: c!, kid: s!, parent: p!, teacher: t! };
}

describe('templates', () => {
  it('escapes values except _HTML ones, and admin edits are cleaned', async () => {
    expect(fill('<p>{A} {B_HTML} {MISSING}</p>', { A: '<b>&', B_HTML: '<i>ok</i>' })).toBe('<p>&lt;b&gt;&amp; <i>ok</i> {MISSING}</p>');
    const { actor } = await makeStaff({ isSuper: true });
    expect((await saveTemplate(db, actor, 'student.left', { version: 'Urgent', subject: 'Left', body: '<p onclick="x()">Hi {CONTACT_NAME}</p><script>alert(1)</script>' })).ok).toBe(true);
    const t = await getTemplate(db, 'student.left', 'urgent');
    expect(t.body).toBe('<p>Hi {CONTACT_NAME}</p>');
    expect((await getTemplate(db, 'student.left')).edited).toBe(false);
    const r = await render(db, 'student.left', { CONTACT_NAME: 'A & B' }, 'Urgent');
    expect(r.html).toContain('Hi A &amp; B');
  });
});

describe('mail queue', () => {
  it('sends within the per-minute limit with the log driver, and attaches real PDFs', async () => {
    const f = await family();
    await setSetting(f.actor, 'mail', { perMinute: '1' });
    const [inv] = await db.insert(invoice).values({ studentId: f.kid.id, academicYearId: f.year.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 2500 }).returning();
    const [p1] = await db.insert(payment).values({ invoiceId: inv!.id, amountPence: 2500, receivedOn: '2026-09-02', method: 'Cash' }).returning();
    expect(await sendReceipts(db, f.actor, [p1!.id], true)).toEqual({ queued: 1, noEmail: 0 });
    await studentLeftEmails(db, [f.kid.id]);
    expect(await processMailQueue(db)).toBe(1);
    expect(await processMailQueue(db)).toBe(0); // limit reached this minute
    expect(logOutbox[0]!.to).toBe('"Parent Comm" <parent.comm@example.org>');
    expect(logOutbox[0]!.attachments[0]!.content.subarray(0, 4).toString()).toBe('%PDF');
    expect((await db.select().from(payment))[0]!.receiptState).toBe('sent');
    expect((await db.select().from(mailQueue).where(eq(mailQueue.status, 'queued')))).toHaveLength(1);
  }, 60_000);
});

describe('teacher logins (question 14)', () => {
  it('first sign-in emails a one-time link; an admin-set password must be changed', async () => {
    const f = await family();
    expect(await syncPortalLogin(db, 'teacher', f.teacher.id, f.teacher.email, '')).toBeNull();
    const first = await login(db, 'teacher', 'teacher.comm@example.org', 'anything at all');
    expect(first).toMatchObject({ ok: false, noPasswordYet: expect.any(Number) });
    await requestPasswordLink(db, 'teacher', 'TEACHER.comm@example.org');
    await requestPasswordLink(db, 'teacher', 'nobody@example.org');
    const [m] = await db.select().from(mailQueue);
    const token = /set-password\/([A-Za-z0-9_-]+)/.exec(m!.html)![1]!;
    expect(await redeemPasswordLink(db, 'parent', token, 'a long new password')).toMatchObject({ ok: false });
    expect(await redeemPasswordLink(db, 'teacher', token, 'short')).toMatchObject({ ok: false });
    expect(await redeemPasswordLink(db, 'teacher', token, 'a long new password')).toMatchObject({ ok: true });
    expect(await redeemPasswordLink(db, 'teacher', token, 'another long password')).toMatchObject({ ok: false });
    const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.teacherId, f.teacher.id));
    expect(idn!.emailVerifiedAt).not.toBeNull();
    expect(await login(db, 'teacher', 'teacher.comm@example.org', 'a long new password')).toMatchObject({ ok: true, mustChangePassword: false });
    await syncPortalLogin(db, 'teacher', f.teacher.id, f.teacher.email, 'admin chose this');
    expect(await login(db, 'teacher', 'teacher.comm@example.org', 'admin chose this')).toMatchObject({ ok: true, mustChangePassword: true });
  });
});

describe('messages', () => {
  it('compose gives each family its own thread; locking stops portal replies; unread and read status work', async () => {
    const f = await family();
    const r = await compose(db, f.actor, { classIds: [String(f.cls.id)], teacherIds: [String(f.teacher.id)], subject: 'Trip', body: 'Bring a coat' });
    expect(r.ok && r.ids).toHaveLength(2);
    const me = { id: f.staff.id, rank: null, isSuper: true };
    expect((await inbox(db, me, { box: 'inbox' })).every((t) => !t.unread)).toBe(true);
    const parentThread = (await inbox(db, me, { box: 'inbox', who: 'contacts' }))[0]!;
    expect(await reply(db, { kind: 'contact', id: f.parent.id, name: 'Parent Comm' }, parentThread.id, 'Thanks!')).toEqual({ ok: true });
    expect((await inbox(db, me, { box: 'inbox' })).find((t) => t.id === parentThread.id)!.unread).toBe(true);
    const open = await openThread(db, f.staff.id, parentThread.id);
    expect(open!.messages[0]!.readBy).toEqual(['Parent Comm']);
    expect((await inbox(db, me, { box: 'inbox' })).find((t) => t.id === parentThread.id)!.unread).toBe(false);
    expect(await reply(db, { kind: 'admin', id: f.staff.id, name: 'Admin' }, parentThread.id, 'See you', { lock: true })).toEqual({ ok: true });
    expect(await reply(db, { kind: 'contact', id: f.parent.id, name: 'Parent Comm' }, parentThread.id, 'One more')).toMatchObject({ ok: false });
    expect((await inbox(db, me, { box: 'locked' })).map((t) => t.id)).toContain(parentThread.id);
    expect(await bulkThreads(db, f.actor, [parentThread.id], 'unlock')).toBe(1);
    expect(await deleteRange(db, f.actor, { from: '2000-01-01', to: '2100-01-01', person: `contact:${f.parent.id}` })).toMatchObject({ ok: true, n: 3 });
    expect((await db.select().from(messageThread).where(eq(messageThread.id, parentThread.id)))[0]!.deletedAt).not.toBeNull();
    expect((await db.select().from(mailQueue)).map((m) => m.toEmail).sort()).toEqual(expect.arrayContaining(['parent.comm@example.org', 'teacher.comm@example.org']));
  });

  it('enforces the §4 messaging routes for portal senders', async () => {
    const f = await family();
    const t = { kind: 'teacher' as const, id: f.teacher.id }, p = { kind: 'contact' as const, id: f.parent.id };
    expect(await routeAllowed(db, t, p)).toBe(false); // no Messaging privilege on the class yet
    await db.insert(classTeacher).values({ classId: f.cls.id, teacherId: f.teacher.id, canMessage: true });
    expect(await routeAllowed(db, t, p)).toBe(true);
    await setSetting(f.actor, 'messaging', { teachersToAdmins: 'on', teachersToTeachers: 'on', contactsToAdmins: 'on' }); // primary-contact route now off
    expect(await routeAllowed(db, t, p)).toBe(false);
    expect(await routeAllowed(db, p, t)).toBe(false); // contacts → teachers off by default
    await setSetting(f.actor, 'messaging', { contactsToTeachersSameGender: 'on' });
    expect(await routeAllowed(db, p, t)).toBe(true); // both Female
    await db.update(contact).set({ gender: 'Male' }).where(eq(contact.id, f.parent.id));
    expect(await routeAllowed(db, p, t)).toBe(false);
    expect(await startFromPortal(db, { ...p, name: 'Parent Comm' }, t, 'Hi', 'Hello')).toMatchObject({ ok: false });
    expect(await routeAllowed(db, p, { kind: 'admin', id: 0 })).toBe(false);
  });
});

describe('newsletters and SMS', () => {
  it('newsletters go once to each address in the audience, with the body cleaned', async () => {
    const f = await family();
    const [p2] = await db.insert(contact).values({ name: 'Same Email', email: 'PARENT.comm@example.org' }).returning();
    await db.insert(studentContact).values({ studentId: f.kid.id, contactId: p2!.id, type: 'Parent' });
    expect(await recipients(db, 'parents')).toHaveLength(1);
    const n = await saveNewsletter(db, f.actor, { subject: 'News', audience: 'parents', style: 'dark', body: '<p>Hello {NAME}</p><img src=x onerror=alert(1)>' });
    expect(n.ok).toBe(true);
    expect(await sendNewsletter(db, f.actor, n.ok ? n.id : 0)).toEqual({ ok: true, n: 1 });
    const [m] = await db.select().from(mailQueue);
    expect(m!.html).toContain('Hello Parent Comm');
    expect(m!.html).not.toContain('onerror');
  });

  it('lists WhatsApp recipients once each with the message filled in, counting numbers it can.t use', async () => {
    const f = await family();
    const [noMobile] = await db.insert(contact).values({ name: 'Bad Number', email: 'badnumber@example.org', mobile: '12' }).returning();
    await db.insert(studentContact).values({ studentId: f.kid.id, contactId: noMobile!.id, type: 'Parent', isPrimary: true });
    const r = await whatsappList(db, 'currentPrimary', 'Salaam {NAME}, from {SCHOOL_NAME}');
    expect(r.unusable).toBe(1);
    expect(r.people).toHaveLength(1);
    expect(r.people[0]).toMatchObject({ name: 'Parent Comm', number: '447700900111' });
    expect(r.people[0]!.text).toMatch(/^Salaam Parent, from /);
    expect((await whatsappList(db, 'teachers', 'Hi {NAME}')).people.map((p) => p.text)).toEqual(['Hi Teacher']);
  });

  it('normalises numbers, builds WhatsApp links, queues and sends texts with the log driver', async () => {
    const f = await family();
    expect(normaliseNumber('07700 900111')).toBe('+447700900111');
    expect(normaliseNumber('+1 (555) 010-9999')).toBe('+15550109999');
    expect(normaliseNumber('12')).toBeNull();
    expect(whatsappLink('07700 900111', 'Salaam & hello')).toBe('https://wa.me/447700900111?text=Salaam%20%26%20hello');
    const people = [...await groupRecipients(db, 'currentPrimary'), ...csvRecipients('number,name\n07700900111,Dup\n07700 900333,Extra')];
    const q = await queueSms(db, f.actor, people, { body: '{SCHOOL_NAME}: hello {NAME}' });
    expect(q).toEqual({ ok: true, n: 2, skipped: 1 });
    expect(await processSmsQueue(db)).toBe(2);
    expect(smsOutbox.some((x) => x.to === '+447700900111' && x.body.endsWith(': hello Parent Comm'))).toBe(true);
    expect((await db.select().from(smsMessage)).every((m) => m.status === 'sent')).toBe(true);
    expect(await groupRecipients(db, 'unassigned')).toHaveLength(0);
  });
});

describe('daily jobs', () => {
  it('claim a day once, wait until 6am, and send attendance alerts once per interval', async () => {
    const f = await family();
    expect(await claimDay(db, 'test', '2026-10-01')).toBe(true);
    expect(await claimDay(db, 'test', '2026-10-01')).toBe(false);
    expect(await claimDay(db, 'test', '2026-10-02')).toBe(true);
    expect(await runDaily(db, new Date('2026-10-05T03:00:00Z'))).toBe(false); // 04:00 in London
    await setSetting(f.actor, 'alerts', { enabled: 'on' });
    expect(await runDaily(db, new Date('2026-10-05T08:00:00Z'))).toBe(true);
    expect(await runDaily(db, new Date('2026-10-05T09:00:00Z'))).toBe(false);
    expect(await db.select().from(alertSent)).toHaveLength(0); // no registers, so nobody to alert
    expect((await db.select().from(adminStaff)).length).toBe(1);
  });
});
