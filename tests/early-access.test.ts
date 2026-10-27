import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { earlyAccessSignup, mailQueue } from '@/db/schema';
import { POST } from '@/app/api/early-access/route';
import { db, resetDb } from './helpers';

const env = { MARKETING_SITE: process.env.MARKETING_SITE, EARLY_ACCESS_NOTIFY_EMAIL: process.env.EARLY_ACCESS_NOTIFY_EMAIL, TRUST_PROXY: process.env.TRUST_PROXY };
beforeAll(() => { process.env.MARKETING_SITE = '1'; process.env.EARLY_ACCESS_NOTIFY_EMAIL = 'owner@example.org'; process.env.TRUST_PROXY = '1'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const valid = { school: 'Sample Madressa', name: 'Sample Person', role: 'Administrator', email: 'Sample.Person@Example.org', students: '120', type: 'Mosque classes' };
let ipCounter = 0;
const post = (body: unknown, ip = `203.0.113.${++ipCounter}`) =>
  POST(new Request('http://localhost/api/early-access', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) }));

describe('POST /api/early-access', () => {
  it('stores a valid sign-up and queues the notification email', async () => {
    const r = await post(valid);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
    const [row] = await db.select().from(earlyAccessSignup);
    expect(row).toMatchObject({ school: 'Sample Madressa', name: 'Sample Person', role: 'Administrator', email: 'sample.person@example.org', students: 120, type: 'Mosque classes' });
    expect(row!.createdAt).toBeInstanceOf(Date);
    const mails = await db.select().from(mailQueue).where(eq(mailQueue.entity, 'early_access_signup'));
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ toEmail: 'owner@example.org', replyTo: 'sample.person@example.org', subject: 'Madressa System early access: Sample Madressa', entityId: row!.id });
    expect(mails[0]!.html).toContain('Mosque classes');
  });

  it('accepts a blank number of students', async () => {
    expect((await post({ ...valid, students: '' })).status).toBe(201);
    const [row] = await db.select().from(earlyAccessSignup);
    expect(row!.students).toBeNull();
  });

  it('escapes what visitors type in the notification email', async () => {
    await post({ ...valid, school: '<script>x</script>' });
    const [mail] = await db.select().from(mailQueue);
    expect(mail!.html).not.toContain('<script>');
  });

  const bad: [string, Record<string, unknown>, string][] = [
    ['school', { school: '' }, 'Please enter your madressa’s name.'],
    ['school', { school: undefined }, 'Please enter your madressa’s name.'],
    ['name', { name: '   ' }, 'Please enter your name.'],
    ['email', { email: '' }, 'Please enter your email.'],
    ['email', { email: 'not-an-email' }, 'Enter an email address like name@example.org.'],
    ['students', { students: '0' }, 'Enter a number from 1 to 20,000, or leave it blank.'],
    ['students', { students: '20001' }, 'Enter a number from 1 to 20,000, or leave it blank.'],
    ['students', { students: '12.5' }, 'Enter a whole number, or leave it blank.'],
    ['students', { students: 'lots' }, 'Enter a number, or leave it blank.'],
    ['role', { role: 'Caretaker' }, 'Please choose one of the options.'],
    ['type', { type: 'University' }, 'Please choose one of the options.']
  ];
  for (const [field, change, message] of bad) {
    it(`rejects ${field} = ${JSON.stringify(Object.values(change)[0])} with that field's error`, async () => {
      const r = await post({ ...valid, ...change });
      expect(r.status).toBe(422);
      expect(await r.json()).toEqual({ ok: false, errors: { [field]: message } });
      expect(await db.select().from(earlyAccessSignup)).toHaveLength(0);
    });
  }

  it('answers a body that is not JSON with every required field’s error', async () => {
    const r = await post('school=x');
    expect(r.status).toBe(422);
    expect(Object.keys((await r.json()).errors).sort()).toEqual(['email', 'name', 'role', 'school', 'type']);
  });

  it('allows 5 sign-ups an hour from one IP, then refuses with 429', async () => {
    for (let i = 0; i < 5; i++) expect((await post({ ...valid, email: `p${i}@example.org` }, '198.51.100.7')).status).toBe(201);
    const r = await post(valid, '198.51.100.7');
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ ok: false });
    expect(await db.select().from(earlyAccessSignup)).toHaveLength(5);
    expect((await post(valid, '198.51.100.8')).status).toBe(201); // other visitors aren't affected
  });

  it('does not exist on a madrasah copy (no MARKETING_SITE)', async () => {
    delete process.env.MARKETING_SITE;
    try { expect((await post(valid)).status).toBe(404); } finally { process.env.MARKETING_SITE = '1'; }
  });
});
