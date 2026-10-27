import { z } from 'zod';
import type { DbOrTx } from '@/db';
import { earlyAccessSignup } from '@/db/schema';
import { EA_ROLES, EA_TYPES, PRODUCT_NAME } from '@/lib/marketing';
import { zodErrors, type FieldErrors } from '@/lib/validate';
import { hitRateLimit } from './auth';
import { enqueueMail } from './comm/mail';

/*
 * Early-access sign-ups from the marketing homepage (POST /api/early-access). Public, so: validated here, limited per IP,
 * stored without the IP, and the owner is told by email (EARLY_ACCESS_NOTIFY_EMAIL) through the normal mail queue.
 */

const required = (msg: string, max: number) => z.string({ error: msg }).trim().min(1, msg).max(max, `Keep this under ${max} characters.`);
const choice = <T extends readonly [string, ...string[]]>(list: T) => z.enum(list, { error: 'Please choose one of the options.' });

export const earlyAccessInput = z.object({
  school: required('Please enter your madressa’s name.', 200),
  name: required('Please enter your name.', 120),
  role: choice(EA_ROLES),
  email: z.string({ error: 'Please enter your email.' }).trim().min(1, 'Please enter your email.')
    .pipe(z.email('Enter an email address like name@example.org.').max(200, 'Keep this under 200 characters.')).transform((v) => v.toLowerCase()),
  // The form sends text; blank means "not given".
  students: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number({ error: 'Enter a number, or leave it blank.' })
    .int('Enter a whole number, or leave it blank.').min(1, 'Enter a number from 1 to 20,000, or leave it blank.').max(20_000, 'Enter a number from 1 to 20,000, or leave it blank.')
    .optional()).transform((v) => v ?? null),
  type: choice(EA_TYPES)
});

export const EA_LIMIT = { hits: 5, windowMs: 60 * 60_000 }; // sign-ups per IP per hour

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function signUpForEarlyAccess(db: DbOrTx, raw: unknown, ip: string | null):
  Promise<{ status: 201; body: { ok: true } } | { status: 422; body: { ok: false; errors: FieldErrors } } | { status: 429; body: { ok: false; error: string } }> {
  const p = earlyAccessInput.safeParse(raw && typeof raw === 'object' ? raw : {});
  if (!p.success) return { status: 422, body: { ok: false, errors: zodErrors(p.error) } };
  // shortcut: without a trusted proxy header every visitor shares one key, so the limit is site-wide; set TRUST_PROXY=1 behind Caddy.
  if (!(await hitRateLimit(db, `early-access:${ip ?? 'unknown'}`, EA_LIMIT))) return { status: 429, body: { ok: false, error: 'Too many sign-ups from here. Please try again in an hour.' } };
  const v = p.data;
  const [row] = await db.insert(earlyAccessSignup).values(v).returning();
  const to = process.env.EARLY_ACCESS_NOTIFY_EMAIL?.trim();
  if (to) {
    const lines: [string, string][] = [['Madressa or school', v.school], ['Name', v.name], ['Role', v.role], ['Email', v.email], ['Students', v.students ? String(v.students) : 'Not given'], ['Kind of school', v.type]];
    await enqueueMail(db, [{
      to, subject: `${PRODUCT_NAME} early access: ${v.school}`, replyTo: v.email, entity: 'early_access_signup', entityId: row!.id,
      html: `<p>A new early-access sign-up:</p><table>${lines.map(([k, val]) => `<tr><th align="left">${k}</th><td>${esc(val)}</td></tr>`).join('')}</table>`
    }]);
  }
  return { status: 201, body: { ok: true } };
}
