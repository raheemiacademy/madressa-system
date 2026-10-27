import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contact, loginIdentity, student, studentContact, teacher } from '@/db/schema';
import { GET } from '@/app/api/owner/summary/route';
import { isPrivateAddress } from '@/server/owner/summary';
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

async function school() {
  const [current, waiting] = await db.insert(student).values([
    { firstName: 'Sample', surname: 'Child', status: 'Current', mobile: '07700900001', address: '1 Sample Street', notes: 'private note' },
    { firstName: 'Waiting', surname: 'Child', status: 'Waiting List' }
  ]).returning();
  const [mum, dad, other] = await db.insert(contact).values([{ name: 'Sample Parent', email: 'parent.one@example.org' }, { name: 'Second Parent', email: 'parent.two@example.org' }, { name: 'Waiting Parent' }]).returning();
  await db.insert(studentContact).values([{ studentId: current!.id, contactId: mum!.id }, { studentId: current!.id, contactId: dad!.id }, { studentId: waiting!.id, contactId: other!.id }]);
  await db.insert(loginIdentity).values({ portal: 'parent', email: 'parent.one@example.org', passwordHash: 'x', contactId: mum!.id, lastLoginAt: new Date('2026-10-20T18:00:00Z') });
  await db.insert(teacher).values([{ name: 'Sample Teacher' }, { name: 'Old Teacher', status: 'Resigned' }]);
  await makeStaff({ name: 'Sample Admin', phone: '07700900002' });
}

describe('GET /api/owner/summary', () => {
  it('answers a container on the private network that has the token, with counts only', async () => {
    await school();
    const r = await get({ ...internal, authorization: `Bearer ${TOKEN}` });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body = await r.json();
    expect(body).toEqual({ version: LATEST.version, counts: { students: 1, teachers: 1, staff: 1, parents: 2, parentsWithLogin: 1 }, lastActiveAt: '2026-10-20T18:00:00.000Z' });
  });

  it('never contains anything but those fields: no names, emails, phones, addresses or notes', async () => {
    await school();
    const text = await (await get({ ...internal, authorization: `Bearer ${TOKEN}` })).text();
    const keys = (o: unknown, at = ''): string[] => o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [`${at}${k}`, ...keys(v, `${at}${k}.`)]) : [];
    expect(keys(JSON.parse(text)).sort()).toEqual(['counts', 'counts.parents', 'counts.parentsWithLogin', 'counts.staff', 'counts.students', 'counts.teachers', 'lastActiveAt', 'version']);
    for (const secret of ['Sample', 'Child', 'Parent', 'example.org', '07700', 'Street', 'private note', 'Admin', 'Teacher']) expect(text).not.toContain(secret);
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

  it('counts an empty madrasah as zeros, never used', async () => {
    const body = await (await get({ ...internal, authorization: `Bearer ${TOKEN}` })).json();
    expect(body).toEqual({ version: LATEST.version, counts: { students: 0, teachers: 0, staff: 0, parents: 0, parentsWithLogin: 0 }, lastActiveAt: null });
  });

  it('knows private addresses from public ones', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.1', '192.168.1.1', '127.0.0.1', '::1', '::ffff:172.18.0.3', 'fd00::1']) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '213.32.71.244', '2001:db8::1', 'unknown', '']) expect(isPrivateAddress(ip)).toBe(false);
  });
});
