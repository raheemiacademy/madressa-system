import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, lead, mailQueue } from '@/db/schema';
import { sendContactMessage } from '@/server/contact';
import { signUpForEarlyAccess } from '@/server/early-access';
import { ownerState } from '@/server/owner/checks';
import { countNewLeads, listLeads, setLeadNotes, setLeadStatus, setupCommand } from '@/server/owner/leads';
import { db, resetDb } from './helpers';
import { sql } from '@/db';

const env = { EARLY_ACCESS_NOTIFY_EMAIL: process.env.EARLY_ACCESS_NOTIFY_EMAIL };
beforeAll(() => { process.env.EARLY_ACCESS_NOTIFY_EMAIL = 'owner@example.org'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const OWNER = { identityId: null as unknown as number, name: 'Owner' };
const signup = { school: 'Masjid Bilal Maktab, Leicester', name: 'Sample Head', role: 'Head teacher or imam', email: 'head@example.org', students: '95', type: 'Evening or weekend madressa / maktab' };
const contact = { name: 'Sample Person', email: 'Sample.Person@Example.org', school: '', topic: 'Moving our records', message: 'We have 3 classes & <b>no</b> system.\nCan you help?' };
let ip = 0;

describe('leads arrive from the website', () => {
  it('a contact message is kept as a lead, and still emailed', async () => {
    expect((await sendContactMessage(db, contact, `203.0.113.${++ip}`)).status).toBe(201);
    const [l] = await listLeads(db);
    expect(l).toMatchObject({ kind: 'Contact form', status: 'New', name: 'Sample Person', email: 'sample.person@example.org', school: null, topic: 'Moving our records', message: contact.message, notes: '' });
    expect(await db.select().from(mailQueue).where(eq(mailQueue.entity, 'contact_message'))).toHaveLength(1);
  });

  it('an early-access sign-up becomes a lead with the sign-up’s details', async () => {
    expect((await signUpForEarlyAccess(db, signup, `203.0.113.${++ip}`)).status).toBe(201);
    const [l] = await listLeads(db);
    expect(l).toMatchObject({ kind: 'Early access', status: 'New', school: 'Masjid Bilal Maktab, Leicester', name: 'Sample Head', role: 'Head teacher or imam', email: 'head@example.org', students: 95, type: signup.type, message: null });
  });

  it('a refused form makes no lead', async () => {
    await sendContactMessage(db, { ...contact, message: '' }, `203.0.113.${++ip}`);
    await signUpForEarlyAccess(db, { ...signup, email: 'nope' }, `203.0.113.${++ip}`);
    expect(await db.select().from(lead)).toHaveLength(0);
  });

  it('lists newest first and counts the new ones', async () => {
    await sendContactMessage(db, contact, `203.0.113.${++ip}`);
    await signUpForEarlyAccess(db, signup, `203.0.113.${++ip}`);
    const [newest, older] = await db.select().from(lead).orderBy(lead.id);
    await db.update(lead).set({ createdAt: new Date('2026-10-01T10:00:00Z') }).where(eq(lead.id, newest!.id));
    expect((await listLeads(db)).map((l) => l.id)).toEqual([older!.id, newest!.id]);
    expect(await countNewLeads(db)).toBe(2);
  });
});

describe('past leads move in with the migration', () => {
  it('copies every sign-up and every kept contact message, unescaping what the email escaped', async () => {
    await sendContactMessage(db, contact, `203.0.113.${++ip}`);
    await sendContactMessage(db, { ...contact, school: 'Madni Masjid', name: 'O’Brien & Sons', message: 'x' }, `203.0.113.${++ip}`);
    await signUpForEarlyAccess(db, signup, `203.0.113.${++ip}`);
    await db.delete(lead); // as before the migration: only the sign-up table and the mail queue had them
    const steps = readFileSync('drizzle/0017_owner_leads.sql', 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter((s) => /^(-- Past|INSERT|CREATE FUNCTION)/.test(s));
    expect(steps).toHaveLength(3);
    await sql.begin(async (tx) => { for (const s of steps) await tx.unsafe(s); });
    const leads = await listLeads(db);
    expect(leads).toHaveLength(3);
    const byName = Object.fromEntries(leads.map((l) => [l.name, l]));
    expect(byName['Sample Person']).toMatchObject({ kind: 'Contact form', email: 'sample.person@example.org', school: null, topic: 'Moving our records', message: contact.message, status: 'New' });
    expect(byName['O’Brien & Sons']).toMatchObject({ school: 'Madni Masjid', message: 'x' });
    expect(byName['Sample Head']).toMatchObject({ kind: 'Early access', school: 'Masjid Bilal Maktab, Leicester' });
  });
});

describe('status and notes', () => {
  it('sets a status from the list only, and records it', async () => {
    await sendContactMessage(db, contact, `203.0.113.${++ip}`);
    const [l] = await db.select().from(lead);
    expect(await setLeadStatus(db, OWNER, l!.id, 'Contacted')).toEqual({ ok: true });
    expect(await setLeadStatus(db, OWNER, l!.id, 'Signed up')).toEqual({ ok: false, error: 'Choose one of the statuses.' });
    expect(await setLeadStatus(db, OWNER, 999, 'Contacted')).toEqual({ ok: false, error: 'That lead no longer exists.' });
    expect((await db.select().from(lead))[0]!.status).toBe('Contacted');
    expect(await countNewLeads(db)).toBe(0);
    expect((await db.select().from(auditLog).where(eq(auditLog.entity, 'lead'))).map((a) => a.action)).toEqual(['Set a lead to “Contacted”']);
  });

  it('keeps notes (trimmed, empty means none, at most 5000 characters) without writing them into the audit log', async () => {
    await sendContactMessage(db, contact, `203.0.113.${++ip}`);
    const [l] = await db.select().from(lead);
    expect(await setLeadNotes(db, OWNER, l!.id, '  Called 21/10. Wants a demo.  ')).toEqual({ ok: true });
    expect((await listLeads(db))[0]!.notes).toBe('Called 21/10. Wants a demo.');
    expect(await setLeadNotes(db, OWNER, l!.id, 'x'.repeat(5001))).toEqual({ ok: false, error: 'Keep notes under 5000 characters.' });
    expect(await setLeadNotes(db, OWNER, l!.id, 42)).toEqual({ ok: false, error: 'Notes must be text.' });
    expect(await setLeadNotes(db, OWNER, l!.id, '   ')).toEqual({ ok: true });
    expect((await db.select().from(lead))[0]!.notes).toBeNull();
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain('Wants a demo');
  });

  it('new leads go in “Needs you”, newest first, and leave once they have a status', async () => {
    await sendContactMessage(db, contact, `203.0.113.${++ip}`);
    await signUpForEarlyAccess(db, signup, `203.0.113.${++ip}`);
    let s = await ownerState(db, null);
    expect(s.newLeads).toBe(2);
    expect(s.needs.filter((n) => n.kind === 'info').map((n) => `${n.text} ${n.name}`).sort()).toEqual(['New contact message from Sample Person', 'New early-access sign-up: Masjid Bilal Maktab, Leicester']);
    expect(s.needs.find((n) => n.kind === 'info')!.href).toMatch(/^\/owner\/leads\/\d+$/);
    await db.update(lead).set({ status: 'Not interested' });
    s = await ownerState(db, null);
    expect([s.newLeads, s.needs.filter((n) => n.kind === 'info').length]).toEqual([0, 0]);
  });
});

describe('“Set up as a madrasah”', () => {
  it('suggests the server command, with a name ./madrasah add accepts', () => {
    const host = '213-32-71-244.sslip.io';
    expect(setupCommand({ school: 'Masjid Bilal Maktab, Leicester', name: 'x' }, host)).toBe(`./madrasah add masjid-bilal masjid-bilal.${host}`);
    expect(setupCommand({ school: null, name: 'Ustadha Ruqayyah Shah' }, host)).toBe(`./madrasah add ustadha-ruqayyah ustadha-ruqayyah.${host}`);
    expect(setupCommand({ school: 'Ḥalqah al-Qurʾān', name: 'x' }, host)).toBe(`./madrasah add halqah-al halqah-al.${host}`);
    expect(setupCommand({ school: 'مدرسة النور', name: 'x' }, host)).toBe(`./madrasah add new-madrasah new-madrasah.${host}`);
    expect(setupCommand({ school: 'A', name: 'x' }, host)).toBe(`./madrasah add new-madrasah new-madrasah.${host}`);
    const long = setupCommand({ school: 'Abcdefghijklmnopqrstuvwxyz Abcdefghijklmnopqrstuvwxyz', name: 'x' }, host).split(' ')[2]!;
    expect(long).toMatch(/^[a-z0-9][a-z0-9-]{1,29}$/);
  });
});
