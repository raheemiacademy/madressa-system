'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { PAYMENT_STATUSES, invoice, student } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { formObject, type FormState } from '@/lib/validate';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { adminCan, type AdminPerm } from '@/server/permissions';
import { confirmsSchoolName } from '@/server/profile';
import { resolveYear } from '@/server/academic-years';
import { assignSiblingDiscounts, clearAdjustments, deleteSet, familyOf, saveSet, setAdjustments } from '@/server/fees/adjustments';
import { applyAdHoc, createAdmissionFees, createContribution, generateInvoices } from '@/server/fees/generate';
import { checkFeeRows, commitFeeRows } from '@/server/fees/imports';
import { bulkDelete, deleteInvoice, invoiceRows, movePayment, processPayments, recordPayment, saveInvoice } from '@/server/fees/invoices';
import { applyModify, previewModify, setReceiptState } from '@/server/fees/modify';
import { sendReceipts, sendReminders } from '@/server/comm/notify';
import { deleteStructure, saveStructure, setClassStructure } from '@/server/fees/structures';
import { parseCsv } from '@/server/people/csv';
import type { RowResult } from '@/server/people/imports';

const done = () => revalidatePath('/admin', 'layout');

/** Every fees action needs Access Fees Area; some also need another level (e.g. Can delete). */
async function requireFees(also?: AdminPerm) {
  const a = await requireAdmin('fees');
  if (also && !adminCan(a.staff, also)) redirect('/admin/no-access');
  return a;
}
const yearId = async () => (await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null)).year?.id ?? null;
const ids = (fd: FormData, name = 'ids') => fd.getAll(name).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const typedName = async (fd: FormData) => confirmsSchoolName(db, String(fd.get('confirmName') ?? ''));
const nameError = { errors: { confirmName: 'Type the school name exactly as it appears in the school profile' }, message: 'Nothing was changed.' };

/* ───────── Add Fees dialog ───────── */

export async function findStudentsAction(q: string) {
  await requireFees();
  const s = q.trim().slice(0, 60);
  if (s.length < 2 && !/^\d+$/.test(s)) return [];
  return db.select({ id: student.id, name: sql<string>`${student.firstName} || ' ' || ${student.surname}`, status: student.status }).from(student)
    .where(/^#?\d+$/.test(s) ? eq(student.id, Number(s.replace('#', ''))) : sql`lower(${student.firstName} || ' ' || ${student.surname}) like ${`%${s.toLowerCase()}%`}`)
    .orderBy(asc(student.surname), asc(student.firstName)).limit(12);
}

/** The chosen student's invoices with something still to pay, and their siblings. */
export async function paymentOptionsAction(studentId: number) {
  await requireFees();
  const family = await familyOf(db, studentId);
  const rows = (await invoiceRows(db, eq(invoice.studentId, studentId))).filter((r) => r.amountPence - r.received - r.pending > 0);
  return {
    invoices: rows.map((r) => ({ id: r.id, label: `#${r.id} · ${r.description ?? r.type} · due ${formatCalendarDate(r.dueDate)} · ${formatPence(r.amountPence - r.received - r.pending)} to pay` })),
    family: family.filter((f) => f.id !== studentId).map((f) => ({ id: f.id, name: `${f.firstName} ${f.surname}` }))
  };
}

/** What the Add fees box shows on the receipt slip after a payment is recorded (the receipt numbers are the payment IDs). */
export type Slip = { receipts: number[]; amount: string; method: string; on: string };

export async function recordPaymentAction(_p: FormState, fd: FormData): Promise<FormState & { slip?: Slip }> {
  const a = await requireFees();
  const target = String(fd.get('invoiceId') ?? '');
  const sid = Number(fd.get('studentId'));
  const studentIds = target === 'family' ? [sid, ...ids(fd, 'familyIds')] : target === 'oldest' ? [sid] : [];
  const r = await recordPayment(db, actorOf(a), { ...formObject(fd), invoiceId: studentIds.length ? '' : target, studentIds });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: r.ids.length > 1 ? `Payment recorded across ${r.ids.length} invoices.` : 'Payment recorded.',
    slip: { receipts: r.ids, amount: String(fd.get('amount') ?? ''), method: String(fd.get('method') ?? ''), on: String(fd.get('receivedOn') ?? '') } };
}

/* ───────── Invoices and payments ───────── */

export async function saveInvoiceAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const r = await saveInvoice(db, actorOf(a), formObject(fd), id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  redirect(`/admin/fees/student/${fd.get('studentId')}`);
}

export async function deleteInvoiceAction(id: number) {
  const a = await requireFees('delete');
  const r = await deleteInvoice(db, actorOf(a), id);
  done();
  return r.ok ? {} : { error: r.error };
}

/** "Process" selected payments: Cleared, Pending, any status, or delete (which also needs Can delete). */
export async function processPaymentsAction(page: string, _p: FormState, fd: FormData): Promise<FormState> {
  const op = String(fd.get('op') ?? '');
  const a = await requireFees(op === 'delete' ? 'delete' : undefined);
  const chosen = ids(fd);
  if (!chosen.length) return { message: 'Tick at least one payment.' };
  if (op !== 'delete' && !(PAYMENT_STATUSES as readonly string[]).includes(op)) return { message: 'Choose what to do with them.' };
  const n = await processPayments(db, actorOf(a), chosen, op as (typeof PAYMENT_STATUSES)[number] | 'delete', page);
  done();
  return { ok: true, message: `${op === 'delete' ? 'Deleted' : `Set to ${op}:`} ${n === 1 ? '1 payment' : `${n} payments`}.` };
}

export async function movePaymentAction(paymentId: number, invoiceId: number) {
  const a = await requireFees();
  const r = await movePayment(db, actorOf(a), paymentId, invoiceId);
  done();
  return r.ok ? {} : { error: r.error };
}

export async function bulkDeleteAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees('delete');
  if (!(await typedName(fd))) return nameError;
  const r = await bulkDelete(db, actorOf(a), formObject(fd));
  if (!r.ok) return { errors: r.errors, message: 'Nothing was deleted.' };
  done();
  return { ok: true, message: `Deleted ${r.invoices === 1 ? '1 invoice' : `${r.invoices} invoices`} and ${r.payments === 1 ? '1 payment' : `${r.payments} payments`}.` };
}

/* ───────── Generation ───────── */

export async function generateAction(force: boolean, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  if (force && !(await typedName(fd))) return nameError;
  const y = await yearId();
  if (!y) return { message: 'Add an academic year first.' };
  const r = await generateInvoices(db, actorOf(a), y, formObject(fd), { force });
  if (!r.ok) return { message: r.error };
  done();
  const { created, restored, skipped } = r.result;
  return { ok: true, message: `${created === 1 ? '1 invoice' : `${created} invoices`} created${force ? `, ${restored} restored` : ''}; ${skipped} already existed.` };
}

export async function adHocAction(studentId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const r = await applyAdHoc(db, actorOf(a), Number(fd.get('structureId')), [studentId]);
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: r.result.created ? `${r.result.created === 1 ? '1 invoice' : `${r.result.created} invoices`} created.` : 'These invoices already exist for this student.' };
}

export async function contributionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const y = await yearId();
  if (!y) return { message: 'Add an academic year first.' };
  const r = await createContribution(db, actorOf(a), y, { ...formObject(fd), classIds: fd.getAll('classIds').map(String), studentIds: fd.getAll('studentIds').map(String) });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  redirect('/admin/fees/contributions');
}

export async function admissionFeesAction(studentIds: number[]) {
  const a = await requireFees();
  const y = await yearId();
  if (!y) return { error: 'Add an academic year first.' };
  const r = await createAdmissionFees(db, actorOf(a), studentIds.slice(0, 2000), y);
  done();
  return r.ok ? { error: r.n ? undefined : 'They already have admission fee invoices.' } : { error: r.error };
}

/* ───────── Structures, adjustments, discounts ───────── */

export async function saveStructureAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const y = await yearId();
  if (!y) return { message: 'Add an academic year first.' };
  let periods: unknown;
  try { periods = JSON.parse(String(fd.get('periods') ?? '[]')); } catch { return { message: 'The periods couldn’t be read. Reload the page and try again.' }; }
  const r = await saveStructure(db, actorOf(a), y, { name: fd.get('name'), kind: fd.get('kind'), classIds: fd.getAll('classIds').map(String), periods }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: Object.entries(r.errors).filter(([k]) => k.startsWith('period')).map(([, v]) => v).join(' ') || 'Check the highlighted fields.' };
  done();
  redirect('/admin/fees/structure');
}

export async function classStructureAction(classId: number, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const r = await setClassStructure(db, actorOf(a), classId, Number(fd.get('structureId')) || null);
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: 'Fees saved.' };
}

export async function deleteStructureAction(id: number) {
  const a = await requireFees('delete');
  await deleteStructure(db, actorOf(a), id);
  done();
  redirect('/admin/fees/structure');
}

export async function adjustmentsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  if (fd.get('kind') === 'remove') {
    const n = await clearAdjustments(db, actorOf(a), ids(fd, 'studentIds'));
    done();
    return { ok: true, message: `Removed ${n === 1 ? '1 adjustment' : `${n} adjustments`}.` };
  }
  const r = await setAdjustments(db, actorOf(a), { ...formObject(fd), studentIds: fd.getAll('studentIds').map(String) });
  if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
  done();
  return { ok: true, message: `Adjustment set for ${r.n === 1 ? '1 student' : `${r.n} students`}.` };
}

export async function saveSetAction(id: number | null, _p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const rules = fd.getAll('position').map((position, i) => ({ position: String(position), kind: String(fd.getAll('ruleKind')[i] ?? ''), amount: String(fd.getAll('ruleAmount')[i] ?? ''), unit: String(fd.getAll('ruleUnit')[i] ?? '') }))
    .filter((r) => r.amount.trim());
  const r = await saveSet(db, actorOf(a), { title: fd.get('title'), rules }, id ?? undefined);
  if (!r.ok) return { errors: r.errors, message: r.errors.rules ?? 'Check the highlighted fields.' };
  done();
  return { ok: true, message: 'Discount set saved.' };
}

export async function deleteSetAction(id: number) {
  const a = await requireFees('delete');
  await deleteSet(db, actorOf(a), id);
  done();
  return {};
}

export async function assignSiblingAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const r = await assignSiblingDiscounts(db, actorOf(a), Number(fd.get('setId')));
  if (!r.ok) return { message: r.error };
  done();
  return { ok: true, message: `Assigned to ${r.assigned === 1 ? '1 student' : `${r.assigned} students`}${r.skipped ? `; ${r.skipped} kept their own adjustment` : ''}.` };
}

/* ───────── Modify, receipts, import ───────── */

export type ModifyState = { errors?: Record<string, string>; message?: string; ok?: boolean; preview?: { id: number; student: string; description: string; from: string; to: string; problem: string | null }[] } | undefined;

export async function modifyAction(_p: ModifyState, fd: FormData): Promise<ModifyState> {
  const a = await requireFees();
  const raw = { ...formObject(fd), yearId: String(await yearId() ?? '') };
  if (fd.get('apply') === '1') {
    const r = await applyModify(db, actorOf(a), raw);
    if (!r.ok) return { errors: r.errors, message: 'Check the highlighted fields.' };
    done();
    return { ok: true, message: `Modified ${r.n === 1 ? '1 invoice' : `${r.n} invoices`}${r.skipped ? `; ${r.skipped} skipped` : ''}.` };
  }
  const pv = await previewModify(db, raw);
  if (!pv.ok) return { errors: pv.errors, message: 'Check the highlighted fields.' };
  const show = (x: { amountPence: number; dueDate: string; periodFrom: string | null; periodTo: string | null }) =>
    `${formatPence(x.amountPence)}, due ${formatCalendarDate(x.dueDate)}${x.periodFrom ? `, ${formatCalendarDate(x.periodFrom)}–${x.periodTo ? formatCalendarDate(x.periodTo) : ''}` : ''}`;
  return { preview: pv.changes.map((c) => ({ id: c.row.id, student: c.row.studentName, description: c.row.description ?? c.row.type, from: show(c.row), to: show(c.next), problem: c.problem })) };
}

export async function receiptsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const a = await requireFees();
  const state = String(fd.get('op'));
  const chosen = ids(fd);
  if (!chosen.length) return { message: 'Tick at least one payment.' };
  if (state === 'send') {
    const r = await sendReceipts(db, actorOf(a), chosen, fd.get('attachment') === 'on');
    done();
    return { ok: true, message: `Queued ${r.queued === 1 ? '1 receipt' : `${r.queued} receipts`}${r.noEmail ? `; ${r.noEmail} have no email address (flag them “no email” or send manually)` : ''}. They move to Sent once delivered.` };
  }
  if (!['manual', 'no_email', 'unsent'].includes(state)) return { message: 'Choose what to do with them.' };
  const n = await setReceiptState(db, actorOf(a), chosen, state as 'manual' | 'no_email' | 'unsent');
  done();
  return { ok: true, message: `Updated ${n === 1 ? '1 receipt' : `${n} receipts`}.` };
}

/** Quick Send from the receipts list (no attachment). */
export async function quickSendReceiptAction(paymentId: number) {
  const a = await requireFees();
  const r = await sendReceipts(db, actorOf(a), [paymentId], false);
  done();
  return r.queued ? { message: 'Queued.' } : { error: 'No email address for this family.' };
}

/** Reminders: email each contact their chosen outstanding invoices, then show how many went. */
export async function sendRemindersAction(fd: FormData) {
  const a = await requireFees();
  const r = await sendReminders(db, actorOf(a), ids(fd), { version: String(fd.get('version') || 'Standard'), directDebitLink: fd.get('ddLink') === 'on' });
  done();
  redirect(`/admin/fees/reminders?sent=${r.queued}`);
}

export type FeeImportState = { rows?: Record<string, string>[]; results?: RowResult[]; done?: string; error?: string } | undefined;

export async function previewFeeImport(_p: FeeImportState, fd: FormData): Promise<FeeImportState> {
  await requireFees();
  const file = fd.get('file');
  const pasted = String(fd.get('paste') ?? '').trim();
  let text = pasted;
  if (!text && file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) return { error: 'Use a file under 5 MB.' };
    text = await file.text();
  }
  if (!text) return { error: 'Choose a CSV file or paste rows.' };
  const parsed = parseCsv(text.slice(0, 2_000_000));
  if (parsed.error) return { error: parsed.error };
  if (!parsed.rows.length) return { error: 'No rows found under the header row.' };
  return { rows: parsed.rows, results: await checkFeeRows(db, parsed.rows, await yearId()) };
}

export async function commitFeeImport(rows: Record<string, string>[]): Promise<FeeImportState> {
  const a = await requireFees();
  if (!Array.isArray(rows) || rows.length > 5000) return { error: 'Nothing to import' };
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => /^[a-z0-9_]{1,40}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 500)])));
  const y = await yearId();
  const r = await commitFeeRows(db, actorOf(a), await checkFeeRows(db, clean, y), y);
  done();
  return { done: `${r.added} invoices added, ${r.updated} updated, ${r.payments} payments recorded, ${r.skipped} rows skipped.` };
}
