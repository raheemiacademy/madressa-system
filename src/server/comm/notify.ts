import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { adminStaff, alertSent, contact, fireDrill, holidayRequest, holidayRequestStudent, invoice, payment, schoolClass, student, studentContact, teacher } from '@/db/schema';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { plusDays } from '@/lib/fees';
import { formatPence } from '@/lib/money';
import { audit } from '../audit';
import { alertCandidates } from '../attendance/reports';
import { rollCall } from '../attendance/drill';
import { invoiceRows } from '../fees/invoices';
import { todayIso, type Actor } from '../people/common';
import { appUrl } from '../password-links';
import { getProfile } from '../profile';
import { readTab } from '../settings';
import { enqueueMail } from './mail';
import { render } from './templates';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const name = (s: { firstName: string; surname: string }) => `${s.firstName} ${s.surname}`;

/** Primary contacts (with an email) for each student. */
export async function primaryContacts(db: DbOrTx, studentIds: number[]) {
  if (!studentIds.length) return [];
  return db.select({ studentId: studentContact.studentId, id: contact.id, name: contact.name, email: contact.email }).from(studentContact)
    .innerJoin(contact, eq(contact.id, studentContact.contactId)).where(and(inArray(studentContact.studentId, studentIds), eq(studentContact.isPrimary, true), eq(contact.active, true)));
}

/* ───────── Fees ───────── */

/** §2 Send Receipts: emails each cleared payment's receipt to the invoice's billing contact (else the primary contact), optionally with a PDF. */
export async function sendReceipts(db: Db, actor: Actor, paymentIds: number[], attach: boolean) {
  let queued = 0, noEmail = 0;
  const profile = await getProfile(db);
  const showNotes = !!(await readTab(db, 'fees')).feeNotesOnReceipts;
  for (const pid of paymentIds) {
    const [p] = await db.select().from(payment).where(and(eq(payment.id, pid), eq(payment.status, 'Cleared')));
    if (!p) continue;
    const [inv] = await invoiceRows(db, eq(invoice.id, p.invoiceId));
    if (!inv) continue;
    const [billing] = inv.billingContactId ? await db.select().from(contact).where(eq(contact.id, inv.billingContactId)) : [];
    const to = billing?.email ? billing : (await primaryContacts(db, [inv.studentId])).find((c) => c.email);
    if (!to?.email) { noEmail++; continue; }
    const vars = {
      CONTACT_NAME: inv.billingName ?? to.name, STUDENT_NAME: inv.studentName, AMOUNT: formatPence(p.amountPence), RECEIPT_NO: `R${p.id}`, RECEIVED_ON: formatCalendarDate(p.receivedOn),
      METHOD: p.method, INVOICE: `#${inv.id} ${inv.description ?? inv.type}`, BALANCE: formatPence(Math.max(0, inv.balance)), NOTES: showNotes ? [p.note, inv.billingNotes].filter(Boolean).join(' · ') : ''
    };
    const mail = await render(db, 'fees.receipt', vars);
    const pdf = attach ? await render(db, 'fees.receipt-pdf', vars) : null;
    queued += await enqueueMail(db, [{ to: to.email, toName: to.name, subject: mail.subject, html: mail.html, attachments: pdf ? [{ filename: `receipt-R${p.id}.pdf`, html: pdf.html }] : [],
      fromEmail: profile?.receiptSenderEmail, fromName: profile?.receiptSenderName, entity: 'payment', entityId: p.id, createdBy: actor.identityId }]);
  }
  await audit(db, actor, { action: `Queued ${queued === 1 ? '1 receipt' : `${queued} receipts`}${attach ? ' with PDFs' : ''}${noEmail ? `; ${noEmail} had no email address` : ''}`, page: 'Send receipts', entity: 'payment', details: { paymentIds } });
  return { queued, noEmail };
}

/** §2 Reminders: one email per contact listing their chosen invoices with a balance. */
export async function sendReminders(db: Db, actor: Actor, invoiceIds: number[], opts: { version?: string; directDebitLink?: boolean } = {}) {
  const rows = (invoiceIds.length ? await invoiceRows(db, inArray(invoice.id, invoiceIds)) : []).filter((r) => r.balance > 0);
  const contacts = await primaryContacts(db, [...new Set(rows.map((r) => r.studentId))]);
  const billing = rows.some((r) => r.billingContactId) ? await db.select().from(contact).where(inArray(contact.id, rows.map((r) => r.billingContactId).filter((x): x is number => !!x))) : [];
  const byContact = new Map<string, { name: string; email: string; rows: typeof rows }>();
  for (const r of rows) {
    const b = billing.find((c) => c.id === r.billingContactId && c.email);
    const c = b ?? contacts.find((x) => x.studentId === r.studentId && x.email);
    if (!c?.email) continue;
    const k = c.email.toLowerCase();
    byContact.set(k, { name: c.name, email: c.email, rows: [...(byContact.get(k)?.rows ?? []), r] });
  }
  let queued = 0;
  for (const c of byContact.values()) {
    const table = `<table style="width:100%;border-collapse:collapse"><tr><th align="left">Invoice</th><th align="left">Due</th><th align="right">To pay</th></tr>${c.rows.map((r) =>
      `<tr><td>#${r.id} ${esc(r.studentName)}: ${esc(r.description ?? r.type)}</td><td>${formatCalendarDate(r.dueDate)}</td><td align="right">${formatPence(r.balance)}</td></tr>`).join('')}</table>`;
    const m = await render(db, 'fees.reminder', {
      CONTACT_NAME: c.name, STUDENT_NAMES: [...new Set(c.rows.map((r) => r.studentName))].join(', '), TOTAL: formatPence(c.rows.reduce((s, r) => s + r.balance, 0)), INVOICES_HTML: table,
      DIRECT_DEBIT_LINK: opts.directDebitLink ? `You can set up a direct debit in the parent portal: ${appUrl()}/parent` : ''
    }, opts.version);
    queued += await enqueueMail(db, [{ to: c.email, toName: c.name, subject: m.subject, html: m.html, entity: 'reminder', createdBy: actor.identityId }]);
  }
  await audit(db, actor, { action: `Sent fee reminders to ${queued === 1 ? '1 contact' : `${queued} contacts`} (${rows.length} invoices)`, page: 'Reminders', entity: 'invoice', details: { invoiceIds, version: opts.version ?? 'Standard' } });
  return { queued, invoices: rows.length };
}

/* ───────── Attendance ───────── */

/**
 * §4 Attendance alerts: emails each alerted student's primary contacts, at most once per look-back interval per kind.
 * Runs from the daily job when alerts are on, or from "Send now" on the Alerts page.
 */
export async function sendAttendanceAlerts(db: Db, actor: { identityId: number | null; name: string }, today = todayIso()) {
  const { settings, low, high } = await alertCandidates(db, today);
  const since = plusDays(today, -Number(settings.intervalDays) + 1);
  let queued = 0;
  for (const [kind, list] of [['low', low], ['high', high]] as const) {
    for (const c of list) {
      const [recent] = await db.select().from(alertSent).where(and(eq(alertSent.studentId, c.student.id), eq(alertSent.kind, kind), gte(alertSent.sentOn, since))).limit(1);
      if (recent) continue;
      const to = (await primaryContacts(db, [c.student.id])).filter((x) => x.email);
      if (!to.length) continue;
      for (const t of to) {
        const m = await render(db, kind === 'low' ? 'registers.attendance-alert' : 'registers.attendance-well-done', {
          CONTACT_NAME: t.name, STUDENT_NAME: name(c.student), ATTENDANCE: c.summary.standardPct === null ? 'not recorded' : `${c.summary.standardPct.toFixed(1)}%`,
          ABSENCES: String(c.summary.absent), LATES: String(c.summary.late), DAYS: String(settings.intervalDays)
        });
        queued += await enqueueMail(db, [{ to: t.email!, toName: t.name, subject: m.subject, html: m.html, entity: 'student', entityId: c.student.id }]);
      }
      await db.insert(alertSent).values({ studentId: c.student.id, kind, sentOn: today }).onConflictDoNothing();
    }
  }
  await audit(db, actor, { action: `Sent attendance alert emails (${queued})`, page: 'Attendance alerts', entity: 'student' });
  return queued;
}

/** §4 Fire drills: email all admins, and each class's main teacher their class roll call, as the settings say. */
export async function drillEmails(db: Db, drillId: number, yearId: number) {
  const s = await readTab(db, 'fire');
  const [d] = await db.select().from(fireDrill).where(eq(fireDrill.id, drillId));
  if (!d) return 0;
  const time = formatInstant(d.startedAt, 'HH:mm');
  let queued = 0;
  if (s.emailAllAdmins) {
    const admins = await db.select({ name: adminStaff.name, email: adminStaff.email }).from(adminStaff).where(isNull(adminStaff.deletedAt));
    for (const a of admins) {
      const m = await render(db, 'registers.fire-drill-admins', { STARTED_BY: d.startedByName, TIME: time, LINK: `${appUrl()}/admin/fire-drill` });
      queued += await enqueueMail(db, [{ to: a.email, toName: a.name, subject: m.subject, html: m.html, entity: 'fire_drill', entityId: d.id }]);
    }
  }
  if (s.emailClassAttendance) {
    const call = await rollCall(db, yearId);
    const classes = await db.select({ id: schoolClass.id, email: teacher.email, name: teacher.name }).from(schoolClass).innerJoin(teacher, eq(teacher.id, schoolClass.mainTeacherId)).where(eq(schoolClass.academicYearId, yearId));
    for (const c of call.classes) {
      const t = classes.find((x) => x.id === c.classId);
      if (!t?.email) continue;
      const list = `<ul>${c.students.map((st) => `<li>${esc(st.name)}${st.hasMedical ? ' (medical notes)' : ''}</li>`).join('')}</ul>${c.registerTaken ? '' : '<p>The register hasn’t been taken, so this is the whole class.</p>'}`;
      const m = await render(db, 'registers.fire-drill-class', { TEACHER_NAME: t.name, CLASS_NAME: c.name, TIME: time, STUDENTS_HTML: list });
      queued += await enqueueMail(db, [{ to: t.email, toName: t.name, subject: m.subject, html: m.html, entity: 'fire_drill', entityId: d.id }]);
    }
  }
  return queued;
}

/** Tells the parent who made a holiday request what the school decided. */
export async function holidayResponseEmail(db: Db, requestId: number) {
  const [r] = await db.select({ r: holidayRequest, c: contact }).from(holidayRequest).leftJoin(contact, eq(contact.id, holidayRequest.contactId)).where(eq(holidayRequest.id, requestId));
  if (!r?.c?.email) return 0;
  const kids = await db.select({ firstName: student.firstName, surname: student.surname }).from(holidayRequestStudent).innerJoin(student, eq(student.id, holidayRequestStudent.studentId)).where(eq(holidayRequestStudent.requestId, requestId));
  const m = await render(db, 'registers.holiday-response', {
    CONTACT_NAME: r.c.name, STUDENT_NAMES: kids.map(name).join(', '), FROM: formatCalendarDate(r.r.startsOn), TO: formatCalendarDate(r.r.endsOn),
    STATUS: r.r.status === 'Info requested' ? 'we need more information' : r.r.status.toLowerCase(), RESPONSE: r.r.response ?? ''
  });
  return enqueueMail(db, [{ to: r.c.email, toName: r.c.name, subject: m.subject, html: m.html, entity: 'holiday_request', entityId: requestId }]);
}

/** "When marking someone left": the "student left" email to their primary contacts. */
export async function studentLeftEmails(db: DbOrTx, studentIds: number[]) {
  const kids = studentIds.length ? await db.select().from(student).where(inArray(student.id, studentIds)) : [];
  let queued = 0;
  for (const c of (await primaryContacts(db, studentIds)).filter((x) => x.email)) {
    const s = kids.find((k) => k.id === c.studentId);
    if (!s) continue;
    const m = await render(db, 'student.left', { CONTACT_NAME: c.name, STUDENT_NAME: name(s), LEFT_DATE: s.leftDate ? formatCalendarDate(s.leftDate) : formatCalendarDate(todayIso()), STATUS: s.status });
    queued += await enqueueMail(db, [{ to: c.email!, toName: c.name, subject: m.subject, html: m.html, entity: 'student', entityId: s.id }]);
  }
  return queued;
}
