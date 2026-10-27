import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mailQueue } from '@/db/schema';
import { POST } from '@/app/api/contact/route';
import { db, resetDb } from './helpers';

const env = { MARKETING_SITE: process.env.MARKETING_SITE, EARLY_ACCESS_NOTIFY_EMAIL: process.env.EARLY_ACCESS_NOTIFY_EMAIL, TRUST_PROXY: process.env.TRUST_PROXY };
beforeAll(() => { process.env.MARKETING_SITE = '1'; process.env.EARLY_ACCESS_NOTIFY_EMAIL = 'owner@example.org'; process.env.TRUST_PROXY = '1'; });
afterAll(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
beforeEach(resetDb);

const valid = { name: 'Sample Person', email: 'Sample.Person@Example.org', school: '', topic: 'Moving our records', message: 'We have 3 classes.\nCan you help?' };
let ipCounter = 0;
const post = (body: unknown, ip = `203.0.113.${++ipCounter}`) =>
  POST(new Request('http://localhost/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const contactMails = () => db.select().from(mailQueue).where(eq(mailQueue.entity, 'contact_message'));

describe('POST /api/contact', () => {
  it('emails a valid message to the owner, replying to the visitor', async () => {
    const r = await post(valid);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
    const mails = await contactMails();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ toEmail: 'owner@example.org', replyTo: 'sample.person@example.org', subject: 'Madressa System contact: Moving our records (Sample Person)' });
    expect(mails[0]!.html).toContain('We have 3 classes.\nCan you help?');
    expect(mails[0]!.html).toContain('Not given'); // no school
  });

  it('escapes what visitors type', async () => {
    await post({ ...valid, school: '<b>x</b>', message: '<script>x</script>' });
    const [mail] = await contactMails();
    expect(mail!.html).not.toContain('<script>');
    expect(mail!.html).not.toContain('<b>x');
  });

  const bad: [string, Record<string, unknown>, string][] = [
    ['name', { name: ' ' }, 'Please enter your name.'],
    ['email', { email: 'not-an-email' }, 'Enter an email address like name@example.org.'],
    ['topic', { topic: 'Pricing' }, 'Please choose one of the options.'],
    ['message', { message: '' }, 'Please write your message.'],
    ['message', { message: 'x'.repeat(5001) }, 'Keep this under 5000 characters.']
  ];
  for (const [field, change, message] of bad) {
    it(`rejects ${field} = ${JSON.stringify(Object.values(change)[0]).slice(0, 20)} with that field's error`, async () => {
      const r = await post({ ...valid, ...change });
      expect(r.status).toBe(422);
      expect(await r.json()).toEqual({ ok: false, errors: { [field]: message } });
      expect(await contactMails()).toHaveLength(0);
    });
  }

  it('allows 5 messages an hour from one IP, then refuses with 429', async () => {
    for (let i = 0; i < 5; i++) expect((await post(valid, '198.51.100.9')).status).toBe(201);
    expect((await post(valid, '198.51.100.9')).status).toBe(429);
    expect(await contactMails()).toHaveLength(5);
  });

  it('says it could not send (503) when there is nowhere to send it, so the visitor emails instead', async () => {
    delete process.env.EARLY_ACCESS_NOTIFY_EMAIL;
    try { expect((await post(valid)).status).toBe(503); } finally { process.env.EARLY_ACCESS_NOTIFY_EMAIL = 'owner@example.org'; }
    expect(await contactMails()).toHaveLength(0);
  });

  it('does not exist on a madrasah copy (no MARKETING_SITE)', async () => {
    delete process.env.MARKETING_SITE;
    try { expect((await post(valid)).status).toBe(404); } finally { process.env.MARKETING_SITE = '1'; }
  });
});
