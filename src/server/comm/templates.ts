import { and, asc, eq, sql } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { template } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from '../people/common';
import { getProfile } from '../profile';
import { readTab } from '../settings';
import { todayIso } from '../people/common';

/** Built-in email and PDF templates (§19 Templates Editor). Admin edits are stored as overrides; extra versions sit beside them. */
type Def = { group: string; name: string; subject: string; body: string; vars: string[]; pdf?: boolean };
const common = ['SCHOOL_NAME', 'DATE', 'HIJRI_DATE'];

export const TEMPLATES: Record<string, Def> = {
  'fees.receipt': {
    group: 'Fees', name: 'Receipt email', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'AMOUNT', 'RECEIPT_NO', 'RECEIVED_ON', 'METHOD', 'INVOICE', 'BALANCE'],
    subject: 'Receipt {RECEIPT_NO} from {SCHOOL_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>Thank you. We received <strong>{AMOUNT}</strong> on {RECEIVED_ON} by {METHOD} for {STUDENT_NAME} ({INVOICE}).</p><p>Balance left on this invoice: {BALANCE}.</p><p>Receipt number: {RECEIPT_NO}</p>'
  },
  'fees.receipt-pdf': {
    group: 'Fees', name: 'Receipt PDF', pdf: true, vars: [...common, 'SCHOOL_ADDRESS', 'CONTACT_NAME', 'STUDENT_NAME', 'AMOUNT', 'RECEIPT_NO', 'RECEIVED_ON', 'METHOD', 'INVOICE', 'BALANCE', 'NOTES'],
    subject: 'Receipt {RECEIPT_NO}',
    body: '<h1>{SCHOOL_NAME}</h1><p>{SCHOOL_ADDRESS}</p><h2>Receipt {RECEIPT_NO}</h2><table><tr><th>Received from</th><td>{CONTACT_NAME}</td></tr><tr><th>Student</th><td>{STUDENT_NAME}</td></tr><tr><th>Date received</th><td>{RECEIVED_ON}</td></tr><tr><th>Amount</th><td>{AMOUNT}</td></tr><tr><th>Method</th><td>{METHOD}</td></tr><tr><th>For</th><td>{INVOICE}</td></tr><tr><th>Invoice balance now</th><td>{BALANCE}</td></tr></table><p>{NOTES}</p>'
  },
  'fees.reminder': {
    group: 'Fees', name: 'Fees reminder', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAMES', 'TOTAL', 'INVOICES_HTML', 'DIRECT_DEBIT_LINK'],
    subject: 'Fees reminder from {SCHOOL_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>This is a reminder that {TOTAL} is outstanding for {STUDENT_NAMES}.</p>{INVOICES_HTML}<p>{DIRECT_DEBIT_LINK}</p><p>If you have already paid, thank you, and please ignore this email.</p>'
  },
  'registers.attendance-alert': {
    group: 'Registers', name: 'Attendance alert', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'ATTENDANCE', 'ABSENCES', 'LATES', 'DAYS'],
    subject: 'Attendance for {STUDENT_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>Over the last {DAYS} days {STUDENT_NAME}’s attendance was {ATTENDANCE}, with {ABSENCES} absences and {LATES} lates.</p><p>Please speak to the office if there is anything we can help with.</p>'
  },
  'registers.attendance-well-done': {
    group: 'Registers', name: 'Attendance well done', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'ATTENDANCE', 'DAYS'],
    subject: 'Well done, {STUDENT_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>{STUDENT_NAME}’s attendance over the last {DAYS} days was {ATTENDANCE}. Well done!</p>'
  },
  'registers.holiday-response': {
    group: 'Registers', name: 'Holiday request reply', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAMES', 'FROM', 'TO', 'STATUS', 'RESPONSE'],
    subject: 'Your holiday request: {STATUS}',
    body: '<p>Dear {CONTACT_NAME},</p><p>Your request for {STUDENT_NAMES} to be away from {FROM} to {TO} is: <strong>{STATUS}</strong>.</p><p>{RESPONSE}</p>'
  },
  'registers.fire-drill-admins': {
    group: 'Registers', name: 'Fire drill started (admins)', vars: [...common, 'STARTED_BY', 'TIME', 'LINK'],
    subject: 'Fire drill started at {TIME}',
    body: '<p>{STARTED_BY} started a fire drill at {TIME}.</p><p>Roll call: <a href="{LINK}">{LINK}</a></p>'
  },
  'registers.fire-drill-class': {
    group: 'Registers', name: 'Fire drill class list (teachers)', vars: [...common, 'TEACHER_NAME', 'CLASS_NAME', 'TIME', 'STUDENTS_HTML'],
    subject: 'Fire drill: {CLASS_NAME} roll call',
    body: '<p>Dear {TEACHER_NAME},</p><p>A fire drill started at {TIME}. These students in {CLASS_NAME} are on site:</p>{STUDENTS_HTML}'
  },
  'messaging.new-message': {
    group: 'Messaging', name: 'New message', vars: [...common, 'RECIPIENT_NAME', 'SENDER_NAME', 'SUBJECT', 'MESSAGE', 'LINK'],
    subject: 'New message: {SUBJECT}',
    body: '<p>Dear {RECIPIENT_NAME},</p><p>{SENDER_NAME} sent you a message:</p><blockquote>{MESSAGE}</blockquote><p><a href="{LINK}">Reply in the portal</a></p>'
  },
  'portals.set-password': {
    group: 'Portals', name: 'Set your password', vars: [...common, 'NAME', 'PORTAL', 'LINK', 'HOURS'],
    subject: 'Set your {PORTAL} password for {SCHOOL_NAME}',
    body: '<p>Dear {NAME},</p><p>Use this link to confirm your email and choose your password for the {SCHOOL_NAME} {PORTAL}:</p><p><a href="{LINK}">{LINK}</a></p><p>The link works once and expires in {HOURS} hours. If you didn’t ask for it, you can ignore this email.</p>'
  },
  'homework.new': {
    group: 'Homework', name: 'New homework', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'CLASS_NAME', 'TITLE', 'DEADLINE', 'INSTRUCTIONS'],
    subject: 'Homework for {STUDENT_NAME}: {TITLE}',
    body: '<p>Dear {CONTACT_NAME},</p><p>New homework has been set for {STUDENT_NAME} in {CLASS_NAME}: <strong>{TITLE}</strong>, due {DEADLINE}.</p><p>{INSTRUCTIONS}</p>'
  },
  'homework.reminder': {
    group: 'Homework', name: 'Homework not completed', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'TITLE', 'DEADLINE'],
    subject: 'Homework reminder: {TITLE}',
    body: '<p>Dear {CONTACT_NAME},</p><p>Our records show {STUDENT_NAME} hasn’t completed <strong>{TITLE}</strong>, which was due {DEADLINE}. Please encourage them to finish it.</p>'
  },
  'homework.year-report': {
    group: 'Homework', name: 'Homework year report', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'TOTAL', 'COMPLETED', 'INCOMPLETE', 'PERCENT'],
    subject: 'Homework this year: {STUDENT_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>This year {STUDENT_NAME} completed {COMPLETED} of {TOTAL} homework tasks ({PERCENT}). {INCOMPLETE} were not completed.</p>'
  },
  'incidents.notify': {
    group: 'Incidents', name: 'Incident report to contacts', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'TITLE', 'SEVERITY', 'WHEN', 'REPORT', 'ACTION'],
    subject: 'Incident report: {STUDENT_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>We’re writing about an incident involving {STUDENT_NAME} on {WHEN}.</p><p><strong>{TITLE}</strong> ({SEVERITY})</p><p>{REPORT}</p><p>Action taken: {ACTION}</p><p>Please contact the office if you have any questions.</p>'
  },
  'student.left': {
    group: 'Student', name: 'Student left', vars: [...common, 'CONTACT_NAME', 'STUDENT_NAME', 'LEFT_DATE', 'STATUS'],
    subject: '{STUDENT_NAME} has left {SCHOOL_NAME}',
    body: '<p>Dear {CONTACT_NAME},</p><p>This confirms that {STUDENT_NAME} left {SCHOOL_NAME} on {LEFT_DATE} ({STATUS}).</p><p>Thank you, and we wish them well.</p>'
  }
};
export const TEMPLATE_GROUPS = [...new Set(Object.values(TEMPLATES).map((t) => t.group))];

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** {VAR} substitution. Values are HTML-escaped unless the name ends in _HTML (built by our own code from escaped parts). */
export const fill = (text: string, vars: Record<string, string>, html = true) =>
  text.replace(/\{([A-Z_]+)\}/g, (m, k: string) => (k in vars ? (html && !k.endsWith('_HTML') ? escape(vars[k]!) : vars[k]!) : m));

/** Admin-edited template HTML keeps formatting, links and tables only. */
export const cleanHtml = (html: string) => sanitizeHtml(html, {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'span'],
  allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], '*': ['style'] },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowedStyles: { '*': { 'text-align': [/^(left|right|center)$/], 'font-weight': [/^(bold|normal|\d{3})$/] } }
});

/** Today's Hijri date using the Local settings language, format and offset. */
export async function hijriDate(db: DbOrTx, iso = todayIso()) {
  const s = await readTab(db, 'local');
  const d = new Date(Date.parse(`${iso}T12:00:00Z`) + Number(s.hijriOffset ?? 0) * 86_400_000);
  const opts: Intl.DateTimeFormatOptions = s.hijriFormat === 'numeric' ? { day: 'numeric', month: 'numeric', year: 'numeric' }
    : { day: 'numeric', month: 'long', year: 'numeric', ...(s.hijriFormat === 'weekday' ? { weekday: 'long' } : {}) };
  return new Intl.DateTimeFormat(`${s.hijriLanguage === 'ar' ? 'ar' : 'en-GB'}-u-ca-islamic-umalqura`, { ...opts, timeZone: 'UTC' }).format(d).replace(/\s?AH$/, '');
}

export async function commonVars(db: DbOrTx) {
  const profile = await getProfile(db);
  return { SCHOOL_NAME: profile?.name ?? 'School', DATE: formatCalendarDate(todayIso()), HIJRI_DATE: await hijriDate(db), SCHOOL_ADDRESS: [profile?.address, profile?.city, profile?.postcode].filter(Boolean).join(', ') };
}

/** The stored override for a key and version, or the built-in text. */
export async function getTemplate(db: DbOrTx, key: string, version = 'Standard') {
  const def = TEMPLATES[key];
  if (!def) throw new Error(`Unknown template ${key}`);
  const [row] = await db.select().from(template).where(and(eq(template.key, key), sql`lower(${template.version}) = ${version.toLowerCase()}`)).limit(1);
  return { ...def, key, version: row?.version ?? 'Standard', subject: row?.subject ?? def.subject, body: row?.body ?? def.body, edited: !!row };
}

export const versionsOf = async (db: DbOrTx, key: string) =>
  ['Standard', ...(await db.select({ v: template.version }).from(template).where(eq(template.key, key)).orderBy(asc(template.version))).map((r) => r.v).filter((v) => v.toLowerCase() !== 'standard')];

/** Renders a template to a subject and HTML body (email layout or PDF page). */
export async function render(db: DbOrTx, key: string, vars: Record<string, string>, version = 'Standard') {
  const t = await getTemplate(db, key, version);
  const all = { ...(await commonVars(db)), ...vars };
  const body = fill(t.body, all);
  return { subject: fill(t.subject, all, false), html: t.pdf ? pdfLayout(body) : emailLayout(all.SCHOOL_NAME!, body) };
}

// Email clients and the PDF renderer can't read CSS variables, so the light tokens' values are copied here.
/* eslint-disable no-restricted-syntax */
const C = { bg: '#F5F6FB', panel: '#FFFFFF', line: '#E3E5F0', fg: '#1F2340', muted: '#5E6380' };
/* eslint-enable no-restricted-syntax */
export const emailLayout = (school: string, body: string) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${C.bg};font-family:Inter,Arial,sans-serif;color:${C.fg};line-height:1.5">
<div style="max-width:600px;margin:0 auto;padding:24px"><div style="font-family:Georgia,serif;font-size:22px;margin-bottom:16px">${escape(school)}</div>
<div style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:24px">${body}</div></div></body></html>`;

export const pdfLayout = (body: string) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>
body{font-family:Inter,Arial,sans-serif;color:${C.fg};font-size:12pt;margin:0} h1{font-family:Georgia,serif;font-weight:400;margin:0 0 4px}
table{border-collapse:collapse;width:100%;margin:12px 0} th,td{border-bottom:1px solid ${C.line};padding:6px 8px;text-align:left;vertical-align:top} th{width:40%;color:${C.muted};font-weight:500}
</style></head><body>${body}</body></html>`;

export const templateInput = z.object({
  version: z.string().trim().min(1, 'Name the version').max(40),
  subject: z.string().trim().min(1, 'Add a subject').max(200),
  body: z.string().trim().min(1, 'Add the template text').max(50_000)
});

/** Saves an edited template (or a new version of it). The HTML is cleaned of scripts and unsafe attributes. */
export async function saveTemplate(db: Db, actor: Actor, key: string, raw: unknown) {
  if (!TEMPLATES[key]) return { ok: false as const, errors: { body: 'Unknown template' } };
  const p = templateInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = { ...p.data, body: cleanHtml(p.data.body) };
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(template).where(and(eq(template.key, key), sql`lower(${template.version}) = ${v.version.toLowerCase()}`)).limit(1);
    if (cur) await tx.update(template).set({ subject: v.subject, body: v.body, updatedAt: new Date(), updatedBy: actor.identityId }).where(eq(template.id, cur.id));
    else await tx.insert(template).values({ key, version: v.version, subject: v.subject, body: v.body, updatedBy: actor.identityId });
    await audit(tx, actor, { action: `Saved template “${TEMPLATES[key]!.name}” (${v.version})`, page: 'Templates', entity: 'template', entityId: key });
    return { ok: true as const };
  });
}

/** Back to built-in text (Standard) or remove an extra version. */
export async function resetTemplate(db: Db, actor: Actor, key: string, version: string) {
  await db.transaction(async (tx) => {
    const gone = await tx.delete(template).where(and(eq(template.key, key), sql`lower(${template.version}) = ${version.toLowerCase()}`)).returning({ id: template.id });
    if (gone.length) await audit(tx, actor, { action: `${version.toLowerCase() === 'standard' ? 'Reset' : 'Deleted version'} “${version}” of template “${TEMPLATES[key]?.name ?? key}”`, page: 'Templates', entity: 'template', entityId: key });
  });
}
