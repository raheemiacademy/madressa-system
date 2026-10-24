import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, apiKey, appLog, auditLog, backup, classAssignment, contact, event, fileObject, holiday, invoice, loginIdentity, mailQueue, schoolClass, schoolProfile, session, student, studentContact, workerHeartbeat } from '@/db/schema';
import { createBackup, deleteOldBackups, listBackups, openBackup, restoreBackup, sealBackup } from '@/server/ops/backup';
import { deleteAllLogs, listLogs, log } from '@/server/ops/logs';
import { apiContacts, apiKeyFor, apiStudents, buildIcs, createApiKey, deleteMailBefore, feedToken, resetFeed, revokeApiKey, sentMail, systemStatus } from '@/server/ops/system';
import { readStored, s3Driver, writeStored } from '@/server/storage';
import { crumbFor } from '@/app/admin/nav';
import { db, makeStaff, resetDb } from './helpers';

process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), 'ra-ops-'));
beforeEach(resetDb);
afterAll(() => sql.end());

describe('backups', () => {
  it('seals with encryption and refuses a tampered file', () => {
    const sealed = sealBackup(Buffer.from('{"hello":"world"}'));
    expect(sealed.includes(Buffer.from('hello'))).toBe(false);
    expect(openBackup(sealed).toString()).toBe('{"hello":"world"}');
    sealed[sealed.length - 1]! ^= 1;
    expect(() => openBackup(sealed)).toThrow();
  });

  it('restores every table exactly, resets ID counters, and signs everyone out', async () => {
    const { actor, identity } = await makeStaff({ isSuper: true });
    await db.insert(schoolProfile).values({ id: 1, name: 'Sample Academy' });
    const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
    const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Backup Class' }).returning();
    const [s] = await db.insert(student).values({ firstName: 'Kept', surname: 'Pupil', status: 'Current', medicalNotesEnc: 'enc-blob', dob: '2016-03-04' }).returning();
    await db.insert(classAssignment).values({ studentId: s!.id, classId: c!.id, fromDate: '2026-09-01' });
    const [p] = await db.insert(contact).values({ name: 'Kept Parent' }).returning();
    await db.insert(studentContact).values({ studentId: s!.id, contactId: p!.id, type: 'Parent', isPrimary: true });
    await db.insert(invoice).values({ studentId: s!.id, academicYearId: y!.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 2500 });
    // A cycle of foreign keys (file → login → student → file) must survive the round trip.
    const [f] = await db.insert(fileObject).values({ storageKey: 'x/photo', filename: 'p.png', mime: 'image/png', size: 1, purpose: 'photo', createdBy: identity.id }).returning();
    await db.update(student).set({ photoFileId: f!.id }).where(eq(student.id, s!.id));
    const made = await createBackup(db, 'Test Admin', 'manual');
    if (!made.ok) throw new Error(made.error);

    // Things change after the backup...
    await db.insert(student).values({ firstName: 'Added', surname: 'Later', status: 'Current' });
    await db.update(student).set({ surname: 'Renamed' }).where(eq(student.id, s!.id));
    await db.delete(invoice);
    await db.insert(session).values({ id: 'sess', identityId: identity.id, portal: 'admin', expiresAt: new Date(Date.now() + 3600_000) });

    expect(await restoreBackup(db, actor, made.id)).toEqual({ ok: true });
    expect((await db.select().from(student)).map((x) => [x.surname, x.medicalNotesEnc, x.dob, x.photoFileId])).toEqual([['Pupil', 'enc-blob', '2016-03-04', f!.id]]);
    expect(await db.select().from(invoice)).toHaveLength(1);
    expect(await db.select().from(session)).toEqual([]);
    expect((await db.select().from(backup)).map((b) => b.id)).toEqual([made.id]); // the list survives a restore
    expect((await db.select().from(auditLog)).at(-1)!.action).toMatch(/^Restored the backup/);
    // New rows carry on from the restored IDs instead of clashing.
    const [next] = await db.insert(student).values({ firstName: 'After', surname: 'Restore', status: 'Current' }).returning();
    expect(next!.id).toBe(s!.id + 1);
    expect(await db.select().from(loginIdentity)).toHaveLength(1);
  });

  it('won’t restore a damaged file, and deletes only backups past the age limit', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const made = await createBackup(db, 'Test Admin', 'nightly');
    if (!made.ok) throw new Error(made.error);
    const [b] = await db.select().from(backup);
    await writeStored(b!.storageKey, Buffer.from('broken'), 'application/octet-stream');
    expect(await restoreBackup(db, actor, made.id)).toMatchObject({ ok: false });
    await db.update(backup).set({ createdAt: new Date(Date.now() - 40 * 86_400_000) });
    await createBackup(db, 'Test Admin', 'manual');
    expect(await deleteOldBackups(db, actor)).toBe(1);
    expect(await listBackups(db)).toHaveLength(1);
  });

  it('refuses to back up without an encryption key', async () => {
    const k = process.env.BACKUP_ENCRYPTION_KEY;
    delete process.env.BACKUP_ENCRYPTION_KEY;
    expect(await createBackup(db, 'x', 'manual')).toMatchObject({ ok: false });
    process.env.BACKUP_ENCRYPTION_KEY = k;
  });
});

describe('logs', () => {
  it('lists logs with the audit trail, filters by kind, and Delete All keeps the audit trail', async () => {
    const { actor, identity } = await makeStaff({ isSuper: true, name: 'Log Admin' });
    await log(db, 'staff', 'Signed in', identity.id);
    await log(db, 'notification', 'Email sent to parent@example.org: Receipt');
    await db.insert(auditLog).values({ actorName: 'Log Admin', action: 'Saved a class', page: 'Classes' });
    const all = await listLogs(db, {});
    expect(all.rows.map((r) => r.kind).sort()).toEqual(['audit', 'notification', 'staff']);
    expect((await listLogs(db, { kind: 'staff' })).rows).toMatchObject([{ message: 'Signed in', who: 'Log Admin' }]);
    expect((await listLogs(db, { kind: 'all', q: 'receipt' })).rows).toHaveLength(1);
    expect(await deleteAllLogs(db, actor)).toBe(2);
    expect(await db.select().from(appLog)).toEqual([]);
    expect((await listLogs(db, { kind: 'audit' })).rows.map((r) => r.message)).toEqual(['Logs: Deleted all logs (2 lines); the audit trail was kept', 'Classes: Saved a class']);
  });
});

describe('storage', () => {
  it('local storage round-trips, and the S3 driver sends the right commands', async () => {
    await writeStored('t/one.txt', Buffer.from('hi'), 'text/plain');
    expect((await readStored('t/one.txt')).toString()).toBe('hi');
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const fake = { send: async (c: { constructor: { name: string }; input: Record<string, unknown> }) => { sent.push({ name: c.constructor.name, input: c.input }); return { Body: { transformToByteArray: async () => new Uint8Array([104, 105]) } }; } };
    const s3 = s3Driver(fake as never, 'school-bucket');
    await s3.write('k', Buffer.from('hi'), 'text/plain');
    expect((await s3.read('k')).toString()).toBe('hi');
    await s3.remove('k');
    expect(sent.map((x) => [x.name, x.input.Bucket, x.input.Key])).toEqual([['PutObjectCommand', 'school-bucket', 'k'], ['GetObjectCommand', 'school-bucket', 'k'], ['DeleteObjectCommand', 'school-bucket', 'k']]);
    expect(sent[0]!.input.ServerSideEncryption).toBe('AES256');
  });
});

describe('calendar feed, API and system status', () => {
  it('serves the calendar only at its secret address, with holidays for parents and active events', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    await db.insert(schoolProfile).values({ id: 1, name: 'Sample Academy' });
    const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2030-07-31', isCurrent: true }).returning();
    await db.insert(holiday).values([{ academicYearId: y!.id, title: 'Half term', startsOn: '2029-10-26', endsOn: '2029-10-30' }, { academicYearId: y!.id, title: 'Staff training', startsOn: '2029-11-02', endsOn: '2029-11-02', showParent: false }]);
    await db.insert(event).values([{ academicYearId: y!.id, name: 'Museum visit; coach', date: '2029-11-20', time: '09:30', durationMinutes: 300 }, { academicYearId: y!.id, name: 'Cancelled trip', date: '2029-11-21', active: false }]);
    const token = await feedToken(db);
    expect(await feedToken(db)).toBe(token);
    const ics = (await buildIcs(db, token))!;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Half term (no classes)');
    expect(ics).toContain('DTEND;VALUE=DATE:20291031'); // all-day end is the day after
    expect(ics).toContain(String.raw`SUMMARY:Museum visit\; coach`); // ; is escaped in ICS text
    expect(ics).toContain('DTSTART;TZID=Europe/London:20291120T093000');
    expect(ics).not.toContain('Staff training');
    expect(ics).not.toContain('Cancelled trip');
    expect(await buildIcs(db, 'wrong-token-wrong-token')).toBeNull();
    await resetFeed(db, actor);
    expect(await buildIcs(db, token)).toBeNull();
  });

  it('API keys are shown once, scoped, revocable, and never return sensitive fields', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    const [s] = await db.insert(student).values({ firstName: 'Api', surname: 'Pupil', status: 'Current', medicalNotesEnc: 'secret', notes: 'private note' }).returning();
    const [p] = await db.insert(contact).values({ name: 'Api Parent', email: 'api.parent@example.org' }).returning();
    await db.insert(studentContact).values({ studentId: s!.id, contactId: p!.id, type: 'Parent', isPrimary: true });
    expect(await createApiKey(db, actor, '', [])).toMatchObject({ ok: false, errors: { name: expect.any(String), scopes: expect.any(String) } });
    const r = await createApiKey(db, actor, 'Website', ['students']);
    if (!r.ok) throw new Error('setup');
    const [row] = await db.select().from(apiKey);
    expect(row!.keyHash).not.toContain(r.key.slice(4));
    expect(await apiKeyFor(db, `Bearer ${r.key}`, 'students')).not.toBeNull();
    expect(await apiKeyFor(db, `Bearer ${r.key}`, 'contacts')).toBeNull();
    expect(await apiKeyFor(db, 'Bearer rak_not-a-real-key-at-all-sorry', 'students')).toBeNull();
    const out = await apiStudents(db, 1);
    expect(out.data).toEqual([expect.objectContaining({ id: s!.id, first_name: 'Api', surname: 'Pupil' })]);
    expect(JSON.stringify(out)).not.toMatch(/secret|private note|medical/);
    expect((await apiContacts(db, 1)).data[0]).toMatchObject({ name: 'Api Parent', students: [{ student_id: s!.id, type: 'Parent', primary: true }] });
    await revokeApiKey(db, actor, row!.id);
    expect(await apiKeyFor(db, `Bearer ${r.key}`, 'students')).toBeNull();
  });

  it('reports the worker as running only while it checks in, and tracks sent email until deleted', async () => {
    const { actor } = await makeStaff({ isSuper: true });
    expect((await systemStatus(db)).worker.running).toBe(false);
    await db.insert(workerHeartbeat).values({ process: 'worker', lastBeat: new Date() });
    expect((await systemStatus(db)).worker.running).toBe(true);
    expect((await systemStatus(db, new Date(Date.now() + 5 * 60_000))).worker.running).toBe(false);
    await db.insert(mailQueue).values([
      { toEmail: 'old@example.org', subject: 'Old receipt', html: '<p>x</p>', status: 'sent', sentAt: new Date('2026-01-05T10:00:00Z') },
      { toEmail: 'new@example.org', subject: 'New receipt', html: '<p>y</p>', status: 'sent', sentAt: new Date('2026-10-05T10:00:00Z') },
      { toEmail: 'wait@example.org', subject: 'Queued', html: '<p>z</p>' }
    ]);
    expect((await sentMail(db)).map((m) => m.m.subject)).toEqual(['New receipt', 'Old receipt']);
    expect(await deleteMailBefore(db, actor, '2026-06-01')).toBe(1);
    expect((await db.select().from(mailQueue)).map((m) => m.subject).sort()).toEqual(['New receipt', 'Queued']);
  });
});

it('names the System tool pages in the top bar', () => {
  for (const p of ['/admin/tools/system', '/admin/tools/backups', '/admin/tools/logs', '/admin/tools/email', '/admin/tools/api']) expect(crumbFor(p)).toMatchObject({ group: 'System', title: 'System' });
  expect(crumbFor('/admin/tools/portals')).toMatchObject({ group: 'System', title: 'Portals' });
});
