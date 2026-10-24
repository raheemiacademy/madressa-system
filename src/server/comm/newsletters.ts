import { and, desc, eq, inArray, isNull, gte, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { adminStaff, classAssignment, contact, fileObject, newsletter, student, studentContact, teacher } from '@/db/schema';
import { zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';
import { appUrl } from '../password-links';
import { enqueueMail } from './mail';
import { cleanHtml, commonVars, fill } from './templates';

export const AUDIENCES = { parents: 'Parents of current students', contacts: 'All contacts', teachers: 'Active teachers', admins: 'Admin staff (for testing)', students: 'Student emails', classes: 'Parents in chosen classes' } as const;
export const STYLES = { modern: 'Modern', fresh: 'Fresh', classic: 'Classic', dark: 'Dark theme', plain: 'Plain' } as const;
type Audience = keyof typeof AUDIENCES;

export const newsletterInput = z.object({
  fromName: z.string().trim().max(120).optional().transform((v) => v || null),
  fromEmail: z.union([z.literal(''), z.email('Enter a valid email address')]).optional().transform((v) => v || null),
  subject: z.string().trim().min(1, 'Add a subject').max(200),
  audience: z.enum(Object.keys(AUDIENCES) as [Audience, ...Audience[]]),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  style: z.enum(Object.keys(STYLES) as [keyof typeof STYLES, ...(keyof typeof STYLES)[]]),
  signature: z.string().trim().max(2000).optional().transform((v) => v || null),
  body: z.string().max(200_000).default(''),
  fileIds: z.array(z.uuid()).max(50).default([])
}).refine((v) => v.audience !== 'classes' || v.classIds.length, { path: ['classIds'], message: 'Choose at least one class' });

export const listNewsletters = (db: DbOrTx) => db.select().from(newsletter).orderBy(desc(newsletter.createdAt));

export async function saveNewsletter(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = newsletterInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = { ...p.data, body: cleanHtml(p.data.body) };
  return db.transaction(async (tx) => {
    const [row] = id ? await tx.update(newsletter).set({ ...v, updatedAt: new Date() }).where(eq(newsletter.id, id)).returning({ id: newsletter.id })
      : await tx.insert(newsletter).values({ ...v, createdBy: actor.identityId }).returning({ id: newsletter.id });
    if (!row) return { ok: false as const, errors: { subject: 'This newsletter no longer exists' } };
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Created'} newsletter “${v.subject}”`, page: 'Newsletters', entity: 'newsletter', entityId: row.id });
    return { ok: true as const, id: row.id };
  });
}

/** Everyone a newsletter goes to, one entry per email address. */
export async function recipients(db: DbOrTx, audience: Audience, classIds: number[] = []) {
  const today = todayIso();
  const current = and(lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today)));
  let rows: { name: string; email: string | null }[] = [];
  if (audience === 'contacts') rows = await db.select({ name: contact.name, email: contact.email }).from(contact).where(eq(contact.active, true));
  if (audience === 'teachers') rows = await db.select({ name: teacher.name, email: teacher.email }).from(teacher).where(and(isNull(teacher.deletedAt), inArray(teacher.status, ['Employed', 'Volunteer'])));
  if (audience === 'admins') rows = await db.select({ name: adminStaff.name, email: adminStaff.email }).from(adminStaff).where(isNull(adminStaff.deletedAt));
  if (audience === 'students') rows = await db.select({ name: sql<string>`${student.firstName} || ' ' || ${student.surname}`, email: student.email }).from(student).where(eq(student.status, 'Current'));
  if (audience === 'parents') rows = await db.select({ name: contact.name, email: contact.email }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId))
    .innerJoin(student, eq(student.id, studentContact.studentId)).where(and(eq(student.status, 'Current'), eq(studentContact.type, 'Parent'), eq(contact.active, true)));
  if (audience === 'classes' && classIds.length) rows = await db.select({ name: contact.name, email: contact.email }).from(classAssignment)
    .innerJoin(studentContact, eq(studentContact.studentId, classAssignment.studentId)).innerJoin(contact, eq(contact.id, studentContact.contactId))
    .where(and(inArray(classAssignment.classId, classIds), current, eq(studentContact.type, 'Parent'), eq(contact.active, true)));
  const seen = new Map<string, { name: string; email: string }>();
  for (const r of rows) if (r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) && !seen.has(r.email.toLowerCase())) seen.set(r.email.toLowerCase(), { name: r.name, email: r.email });
  return [...seen.values()];
}

// Email clients can't read CSS variables, so each style's colours are written out (light tokens and the dark theme's surfaces).
/* eslint-disable no-restricted-syntax */
const STYLE_COLOURS: Record<keyof typeof STYLES, { page: string; card: string; fg: string; accent: string; head: string; font: string }> = {
  modern: { page: '#F5F6FB', card: '#FFFFFF', fg: '#1F2340', accent: '#3D5BC0', head: '#1C2147', font: 'Inter,Arial,sans-serif' },
  fresh: { page: '#EEF6FB', card: '#FFFFFF', fg: '#1F2340', accent: '#2D8FC4', head: '#2D8FC4', font: 'Inter,Arial,sans-serif' },
  classic: { page: '#FFFFFF', card: '#FFFFFF', fg: '#222222', accent: '#1C2147', head: '#1C2147', font: 'Georgia,serif' },
  dark: { page: '#12152E', card: '#1C2147', fg: '#ECEEF8', accent: '#819FEB', head: '#819FEB', font: 'Inter,Arial,sans-serif' },
  plain: { page: '#FFFFFF', card: '#FFFFFF', fg: '#000000', accent: '#0000EE', head: '#000000', font: 'Arial,sans-serif' }
};
/* eslint-enable no-restricted-syntax */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The finished email for one recipient. Images from the image manager are shown inline; other files are links. */
export async function renderNewsletter(db: DbOrTx, n: typeof newsletter.$inferSelect, to: { name: string } = { name: 'Parent' }) {
  const c = STYLE_COLOURS[n.style as keyof typeof STYLES] ?? STYLE_COLOURS.modern;
  const vars = { ...(await commonVars(db)), NAME: to.name };
  const files = n.fileIds.length ? await db.select().from(fileObject).where(inArray(fileObject.id, n.fileIds)) : [];
  const url = (id: string) => `${appUrl()}/files/${id}`;
  const media = files.map((f) => (f.mime.startsWith('image/') ? `<p><img src="${url(f.id)}" alt="${esc(f.filename)}" style="max-width:100%;height:auto;border-radius:8px"></p>` : `<p><a href="${url(f.id)}" style="color:${c.accent}">${esc(f.filename)}</a></p>`)).join('');
  const body = fill(n.body, vars).replace(/<a /g, `<a style="color:${c.accent}" `);
  const sig = n.signature ? `<p style="margin-top:24px;white-space:pre-line">${esc(n.signature)}</p>` : '';
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${c.page};color:${c.fg};font-family:${c.font};line-height:1.55"><div style="max-width:640px;margin:0 auto;padding:24px">
<div style="font-family:Georgia,serif;font-size:24px;color:${c.head};margin-bottom:16px">${esc(vars.SCHOOL_NAME)}</div>
<div style="background:${c.card};border-radius:${n.style === 'plain' || n.style === 'classic' ? 0 : 14}px;padding:24px"><h1 style="font-family:Georgia,serif;font-weight:400;color:${c.head};margin:0 0 12px">${esc(n.subject)}</h1>${body}${media}${sig}</div>
</div></body></html>`;
}

/** Queues the newsletter for every recipient (personalised greeting with {NAME}). */
export async function sendNewsletter(db: Db, actor: Actor, id: number) {
  const [n] = await db.select().from(newsletter).where(eq(newsletter.id, id));
  if (!n) return { ok: false as const, error: 'This newsletter no longer exists' };
  if (!n.body.trim()) return { ok: false as const, error: 'Write the newsletter before sending it' };
  const to = await recipients(db, n.audience as Audience, n.classIds);
  if (!to.length) return { ok: false as const, error: 'Nobody in this audience has an email address' };
  return db.transaction(async (tx) => {
    let queued = 0;
    for (const r of to) queued += await enqueueMail(tx, [{ to: r.email, toName: r.name, subject: n.subject, html: await renderNewsletter(tx, n, r), fromEmail: n.fromEmail, fromName: n.fromName, entity: 'newsletter', entityId: n.id, createdBy: actor.identityId }]);
    await tx.update(newsletter).set({ lastSentAt: new Date(), lastSentCount: queued }).where(eq(newsletter.id, n.id));
    await audit(tx, actor, { action: `Sent newsletter “${n.subject}” to ${queued === 1 ? '1 recipient' : `${queued} recipients`}`, page: 'Newsletters', entity: 'newsletter', entityId: n.id });
    return { ok: true as const, n: queued };
  });
}

export const newsletterFiles = (db: DbOrTx) => db.select().from(fileObject).where(inArray(fileObject.purpose, ['newsletter-image', 'newsletter-file'])).orderBy(desc(fileObject.createdAt));
