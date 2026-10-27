import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, loginIdentity, ownerAction, ownerMadrasahNote } from '@/db/schema';
import { POST } from '@/app/api/owner/set-password-link/route';
import { validateSession } from '@/server/auth';
import type { Health } from '@/server/owner/checks';
import { adminLink, latestActions, madrasahNote, requestAction, saveMadrasahNote } from '@/server/owner/safe-actions';
import { redeemPasswordLink } from '@/server/password-links';
import { db, makeStaff, resetDb } from './helpers';

const TOKEN = 'x'.repeat(40);
const env = { OWNER_SUMMARY_TOKEN: process.env.OWNER_SUMMARY_TOKEN, APP_URL: process.env.APP_URL };
beforeAll(() => { process.env.OWNER_SUMMARY_TOKEN = TOKEN; process.env.APP_URL = 'https://demo.example.org'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const ACTOR = { identityId: null as unknown as number, name: 'Owner' };
const NOW = new Date('2026-10-27T16:00:00Z');
const health: Health = { generatedAt: NOW.toISOString(), madrasahs: [{ name: 'demo', url: 'https://demo.example.org', internal: 'http://ma-demo:3000', backup: null }], history: [], errors: [] };
const audits = async () => (await db.select().from(auditLog).orderBy(auditLog.id)).map((a) => a.action);

describe('restart and back up now', () => {
  it('queues a request for the server script, once, and records it', async () => {
    expect(await requestAction(db, ACTOR, health, 'demo', 'restart', NOW)).toEqual({ ok: true, already: false });
    expect(await requestAction(db, ACTOR, health, 'demo', 'restart', new Date(NOW.getTime() + 60_000))).toEqual({ ok: true, already: true });
    expect(await requestAction(db, ACTOR, health, 'demo', 'backup', NOW)).toEqual({ ok: true, already: false });
    expect((await db.select().from(ownerAction)).map((a) => [a.madrasah, a.action, a.startedAt])).toEqual([['demo', 'restart', null], ['demo', 'backup', null]]);
    expect(await audits()).toEqual(['Asked the server to restart demo', 'Asked the server to back up demo']);
  });

  it('refuses anything but restart or backup, and any name that isn’t a madrasah on the server', async () => {
    expect(await requestAction(db, ACTOR, health, 'demo', 'rm -rf', NOW)).toEqual({ ok: false, error: 'Unknown action.' });
    expect(await requestAction(db, ACTOR, health, 'main', 'restart', NOW)).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(await requestAction(db, ACTOR, null, 'demo', 'restart', NOW)).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(await db.select().from(ownerAction)).toHaveLength(0);
  });

  it('asks again once the last request finished, or went unanswered for 10 minutes', async () => {
    await requestAction(db, ACTOR, health, 'demo', 'restart', NOW);
    await db.update(ownerAction).set({ startedAt: NOW, finishedAt: NOW, result: 'Done' });
    expect(await requestAction(db, ACTOR, health, 'demo', 'restart', new Date(NOW.getTime() + 60_000))).toEqual({ ok: true, already: false });
    expect(await requestAction(db, ACTOR, health, 'demo', 'restart', new Date(NOW.getTime() + 12 * 60_000))).toEqual({ ok: true, already: false });
    const last = await latestActions(db, 'demo');
    expect(last.restart?.requestedAt.toISOString()).toBe(new Date(NOW.getTime() + 12 * 60_000).toISOString());
    expect(last.backup).toBeNull();
  });
});

describe('notes about a madrasah', () => {
  it('saves, replaces and clears them, without putting them in the audit log', async () => {
    expect(await saveMadrasahNote(db, ACTOR, health, 'demo', '  Imam prefers WhatsApp after Isha.  ')).toEqual({ ok: true });
    expect(await madrasahNote(db, 'demo')).toBe('Imam prefers WhatsApp after Isha.');
    await saveMadrasahNote(db, ACTOR, health, 'demo', 'Go-live 01/12.');
    expect(await madrasahNote(db, 'demo')).toBe('Go-live 01/12.');
    await saveMadrasahNote(db, ACTOR, health, 'demo', '   ');
    expect(await db.select().from(ownerMadrasahNote)).toHaveLength(0);
    expect(await saveMadrasahNote(db, ACTOR, health, 'demo', 'x'.repeat(5001))).toEqual({ ok: false, error: 'Keep notes under 5000 characters.' });
    expect(await saveMadrasahNote(db, ACTOR, health, 'nope', 'x')).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain('WhatsApp');
  });
});

// The madrasah copy's side: what the owner dashboard asks it for.
const internal = { host: 'ma-demo:3000', 'x-forwarded-for': '172.18.0.5', 'content-type': 'application/json' };
const post = (body: unknown, headers: Record<string, string> = { ...internal, authorization: `Bearer ${TOKEN}` }) =>
  POST(new Request('http://ma-demo:3000/api/owner/set-password-link', { method: 'POST', headers, body: JSON.stringify(body) }));

describe('POST /api/owner/set-password-link (on a madrasah copy)', () => {
  it('makes a one-time link for that admin, records it in this madrasah’s audit log, and the link works', async () => {
    const a = await makeStaff({ name: 'Locked Out Head', email: 'Head@Example.org' });
    const r = await post({ email: 'head@example.org' });
    expect(r.status).toBe(200);
    const { link } = await r.json() as { link: string };
    expect(link).toMatch(/^https:\/\/demo\.example\.org\/admin\/set-password\/[A-Za-z0-9_-]{43}$/);
    expect(await audits()).toEqual(['Made a set-password link for Head@Example.org']);
    const redeemed = await redeemPasswordLink(db, 'admin', link.split('/').pop()!, 'a brand new password');
    expect(redeemed.ok && (await validateSession(db, 'admin', redeemed.token))?.identity.id).toBe(a.identity.id);
  });

  it('refuses an unknown or blocked admin', async () => {
    await makeStaff({ email: 'blocked@example.org' }, { allowLogin: false });
    expect((await post({ email: 'nobody@example.org' })).status).toBe(404);
    expect((await post({ email: 'blocked@example.org' })).status).toBe(422);
    expect((await post({})).status).toBe(422);
    expect(await db.select().from(loginIdentity).where(eq(loginIdentity.email, 'nobody@example.org'))).toHaveLength(0);
  });

  it('is private and needs the token, like the summary', async () => {
    await makeStaff({ email: 'head@example.org' });
    expect((await post({ email: 'head@example.org' }, { ...internal })).status).toBe(401);
    expect((await post({ email: 'head@example.org' }, { host: 'demo.example.org', 'x-forwarded-for': '203.0.113.9', authorization: `Bearer ${TOKEN}` })).status).toBe(403);
    expect(await audits()).toEqual([]);
  });
});

describe('the main site asking a copy for the link', () => {
  const fake = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('returns the copy’s link and records it on the main site too', async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => { seen.push(`${url} ${new Headers(init.headers).get('authorization')} ${init.body}`); return new Response(JSON.stringify({ link: 'https://demo.example.org/admin/set-password/abc_DEF-123' })); }) as unknown as typeof fetch;
    expect(await adminLink(db, ACTOR, health, 'demo', 'head@example.org', fetcher)).toEqual({ ok: true, link: 'https://demo.example.org/admin/set-password/abc_DEF-123' });
    expect(seen).toEqual([`http://ma-demo:3000/api/owner/set-password-link Bearer ${TOKEN} {"email":"head@example.org"}`]);
    expect(await audits()).toEqual(['Made a set-password link for head@example.org at demo']);
  });

  it('passes on what went wrong, and never shows something that isn’t a set-password link', async () => {
    expect(await adminLink(db, ACTOR, health, 'demo', 'x@example.org', fake(404, { error: 'No admin with that email here.' }))).toEqual({ ok: false, error: 'No admin with that email here.' });
    expect(await adminLink(db, ACTOR, health, 'demo', 'x@example.org', fake(200, { link: 'https://evil.example/phish' }))).toEqual({ ok: false, error: 'demo couldn’t make a link (200).' });
    expect(await adminLink(db, ACTOR, health, 'demo', 'x@example.org', (async () => { throw new Error('down'); }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'demo didn’t answer. Try again in a minute.' });
    expect(await adminLink(db, ACTOR, health, 'flc', 'x@example.org', fake(200, {}))).toEqual({ ok: false, error: 'That madrasah isn’t on the server.' });
    expect(await audits()).toEqual([]);
  });
});
