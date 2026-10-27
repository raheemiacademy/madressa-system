import { z } from 'zod';
import type { DbOrTx } from '@/db';
import { CONTACT_TOPICS, PRODUCT_NAME } from '@/lib/marketing';
import { zodErrors, type FieldErrors } from '@/lib/validate';
import { hitRateLimit } from './auth';
import { enqueueMail } from './comm/mail';

/*
 * The marketing site's contact form (POST /api/contact). Public, so: validated here and limited per IP. Not stored in a
 * table of its own: each message is emailed to EARLY_ACCESS_NOTIFY_EMAIL through the mail queue, which keeps the copy.
 */

const required = (msg: string, max: number) => z.string({ error: msg }).trim().min(1, msg).max(max, `Keep this under ${max} characters.`);

export const contactInput = z.object({
  name: required('Please enter your name.', 120),
  email: z.string({ error: 'Please enter your email.' }).trim().min(1, 'Please enter your email.')
    .pipe(z.email('Enter an email address like name@example.org.').max(200, 'Keep this under 200 characters.')).transform((v) => v.toLowerCase()),
  school: z.string().trim().max(200, 'Keep this under 200 characters.').optional().transform((v) => v || null),
  topic: z.enum(CONTACT_TOPICS, { error: 'Please choose one of the options.' }),
  message: required('Please write your message.', 5000)
});

export const CONTACT_LIMIT = { hits: 5, windowMs: 60 * 60_000 }; // messages per IP per hour

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type Result = { status: 201; body: { ok: true } } | { status: 422; body: { ok: false; errors: FieldErrors } } | { status: 429 | 503; body: { ok: false; error: string } };

export async function sendContactMessage(db: DbOrTx, raw: unknown, ip: string | null): Promise<Result> {
  const p = contactInput.safeParse(raw && typeof raw === 'object' ? raw : {});
  if (!p.success) return { status: 422, body: { ok: false, errors: zodErrors(p.error) } };
  const to = process.env.EARLY_ACCESS_NOTIFY_EMAIL?.trim();
  // Nowhere to send it: say so, so the visitor uses the email address the form shows instead of the message vanishing.
  if (!to) return { status: 503, body: { ok: false, error: 'Messages can’t be sent from here just now.' } };
  if (!(await hitRateLimit(db, `contact:${ip ?? 'unknown'}`, CONTACT_LIMIT))) return { status: 429, body: { ok: false, error: 'Too many messages from here. Please try again in an hour.' } };
  const v = p.data;
  const lines: [string, string][] = [['Name', v.name], ['Email', v.email], ['Madressa or school', v.school ?? 'Not given'], ['About', v.topic]];
  await enqueueMail(db, [{
    to, subject: `${PRODUCT_NAME} contact: ${v.topic} (${v.name})`, replyTo: v.email, entity: 'contact_message',
    html: `<table>${lines.map(([k, val]) => `<tr><th align="left">${k}</th><td>${esc(val)}</td></tr>`).join('')}</table>`
      + `<p style="white-space:pre-wrap">${esc(v.message)}</p>`
  }]);
  return { status: 201, body: { ok: true } };
}
