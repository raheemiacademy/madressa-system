import { createHmac } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, auditLog, classAssignment, directDebitMandate, feeAdjustment, invoice, payment, schoolClass, siblingLink, student } from '@/db/schema';
import { assignSiblingDiscounts, saveSet, setAdjustments } from '@/server/fees/adjustments';
import { createAdmissionFees, createContribution, generateInvoices } from '@/server/fees/generate';
import { handleGoCardless, handleStripe, verifyGoCardless, verifyStripe } from '@/server/fees/gateways';
import { checkFeeRows, commitFeeRows } from '@/server/fees/imports';
import { bulkDelete, deleteInvoice, dropUnpaidAfter, invoiceRows, movePayment, processPayments, recordPayment, saveInvoice } from '@/server/fees/invoices';
import { applyModify, previewModify } from '@/server/fees/modify';
import { diagnose, reminders } from '@/server/fees/reports';
import { saveStructure } from '@/server/fees/structures';
import { db, makeStaff, resetDb } from './helpers';
import { setSetting } from './setting-helper';

beforeEach(resetDb);
afterAll(() => sql.end());

const TODAY = '2026-10-15';
const monthly = { name: 'Monthly', startsOn: '2026-09-01', endsOn: '2027-06-30', invoiceCount: '10', intervalCount: '1', intervalUnit: 'months', amount: '30', startWeekday: '', dueRule: '7' };

async function setup(n = 2) {
  const { actor } = await makeStaff({ isSuper: true });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Fees Class' }).returning();
  const kids = [];
  for (let i = 0; i < n; i++) {
    const [s] = await db.insert(student).values({ firstName: `Kid${i}`, surname: 'Fee', status: 'Current', dob: `2015-0${i + 1}-01` }).returning();
    await db.insert(classAssignment).values({ studentId: s!.id, classId: c!.id, fromDate: '2026-09-01' });
    kids.push(s!);
  }
  const st = await saveStructure(db, actor, y!.id, { name: 'Standard', kind: 'default', periods: [monthly] });
  if (!st.ok) throw new Error(JSON.stringify(st.errors));
  return { actor, year: y!, cls: c!, kids };
}
const live = () => db.select().from(invoice).where(isNull(invoice.deletedAt));

describe('invoice generation', () => {
  it('is idempotent: re-running never duplicates, and only invoices dated up to today are made unless the whole year is asked for', async () => {
    const { actor, year } = await setup();
    const first = await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    expect(first).toEqual({ ok: true, result: { created: 4, restored: 0, skipped: 0 } }); // Sep + Oct for 2 students
    expect(await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY })).toEqual({ ok: true, result: { created: 0, restored: 0, skipped: 4 } });
    const year2 = await generateInvoices(db, actor, year.id, { scope: 'year' }, { today: TODAY });
    expect(year2.ok && year2.result.created).toBe(16);
    expect(await live()).toHaveLength(20);
    const [sep] = (await live()).filter((i) => i.periodFrom === '2026-09-01');
    expect(sep).toMatchObject({ amountPence: 3000, dueDate: '2026-09-07', periodTo: '2026-09-30', type: 'Fees' });
  });

  it('respects deletions; Force Generate restores them', async () => {
    const { actor, year } = await setup(1);
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    const [one] = await live();
    expect(await deleteInvoice(db, actor, one!.id)).toEqual({ ok: true });
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    expect(await live()).toHaveLength(1);
    const forced = await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY, force: true });
    expect(forced.ok && forced.result).toEqual({ created: 0, restored: 1, skipped: 1 });
    expect(await live()).toHaveLength(2);
  });

  it('applies adjustments, skips free students, bills late joiners only from their start, and honours "active only"', async () => {
    const { actor, year, cls, kids } = await setup(3);
    expect((await setAdjustments(db, actor, { studentIds: [kids[0]!.id], kind: 'deduct', amount: '10%', unit: 'percent' })).ok).toBe(true);
    expect((await setAdjustments(db, actor, { studentIds: [kids[1]!.id], kind: 'free', amount: '', unit: 'pence' })).ok).toBe(true);
    const [late] = await db.insert(student).values({ firstName: 'Late', surname: 'Joiner', status: 'Waiting List' }).returning();
    await db.insert(classAssignment).values({ studentId: late!.id, classId: cls.id, fromDate: '2026-10-01' });
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    const rows = await live();
    expect(rows.filter((r) => r.studentId === kids[0]!.id).map((r) => r.amountPence)).toEqual([2700, 2700]);
    expect(rows.filter((r) => r.studentId === kids[1]!.id)).toHaveLength(0);
    expect(rows.filter((r) => r.studentId === late!.id).map((r) => r.periodFrom)).toEqual(['2026-10-01']);
    await db.delete(invoice);
    await generateInvoices(db, actor, year.id, { scope: 'today', activeOnly: 'on' }, { today: TODAY });
    expect((await live()).some((r) => r.studentId === late!.id)).toBe(false);
  });

  it('contributions and admission fees charge each student once', async () => {
    const { actor, year, kids } = await setup();
    const c = await createContribution(db, actor, year.id, { audience: 'active', invoiceDate: '2026-10-01', dueDate: '2026-10-31', description: 'Trip', amount: '12.50' });
    expect(c).toMatchObject({ ok: true, n: 2 });
    expect(await createAdmissionFees(db, actor, [kids[0]!.id], year.id)).toMatchObject({ ok: false });
    await setSetting(actor, 'fees', { admissionFee: '25' });
    expect(await createAdmissionFees(db, actor, [kids[0]!.id], year.id)).toEqual({ ok: true, n: 1 });
    expect(await createAdmissionFees(db, actor, [kids[0]!.id, kids[1]!.id], year.id)).toEqual({ ok: true, n: 1 });
    expect((await live()).map((r) => [r.type, r.amountPence]).sort()).toEqual([['Admission Fees', 2500], ['Admission Fees', 2500], ['Contribution', 1250], ['Contribution', 1250]]);
  });

  it('structures reject periods whose invoices run past the end date', async () => {
    const { actor, year } = await setup(0);
    const r = await saveStructure(db, actor, year.id, { name: 'Bad', kind: 'adhoc', periods: [{ ...monthly, invoiceCount: '12' }] });
    expect(r).toMatchObject({ ok: false });
    expect(await saveStructure(db, actor, year.id, { name: 'Second default', kind: 'default', periods: [] })).toMatchObject({ ok: false, errors: { kind: expect.any(String) } });
  });
});

describe('payments', () => {
  it('records against one invoice, refuses overpaying, splits oldest first, and counts only cleared money as received', async () => {
    const { actor, year, kids } = await setup(1);
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    const [sep, oct] = await invoiceRows(db, eq(invoice.studentId, kids[0]!.id));
    const base = { receivedOn: '2026-10-01', method: 'Cash' };
    expect(await recordPayment(db, actor, { ...base, invoiceId: String(sep!.id), amount: '31' })).toMatchObject({ ok: false, errors: { amount: expect.stringContaining('£1 more than is owed') } });
    expect((await recordPayment(db, actor, { ...base, invoiceId: String(sep!.id), amount: '10', status: 'Pending' })).ok).toBe(true);
    const split = await recordPayment(db, actor, { ...base, studentIds: [String(kids[0]!.id)], amount: '40' });
    expect(split.ok && split.ids).toHaveLength(2);
    const after = await invoiceRows(db, eq(invoice.studentId, kids[0]!.id));
    expect(after.map((r) => [r.received, r.pending, r.status])).toEqual([[2000, 1000, 'Overdue'], [2000, 0, 'Overdue']]);
    expect(await recordPayment(db, actor, { ...base, studentIds: [String(kids[0]!.id)], amount: '20.01' })).toMatchObject({ ok: false });
    const pending = (await db.select().from(payment).where(eq(payment.status, 'Pending')))[0]!;
    expect(await processPayments(db, actor, [pending.id], 'Cleared')).toBe(1);
    expect((await invoiceRows(db, eq(invoice.id, sep!.id)))[0]!.status).toBe('Paid');
    expect(await movePayment(db, actor, pending.id, oct!.id)).toEqual({ ok: true });
    expect(await saveInvoice(db, actor, { type: 'Fees', studentId: String(kids[0]!.id), academicYearId: String(year.id), invoiceDate: '2026-10-01', dueDate: '2026-10-07', amount: '5' }, oct!.id)).toMatchObject({ ok: false, errors: { amount: expect.stringContaining('already been received') } });
    expect(await deleteInvoice(db, actor, oct!.id)).toMatchObject({ ok: false });
  });

  it('bulk delete needs "include payments" when payments exist and is audited', async () => {
    const { actor, year, kids } = await setup(1);
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    const [sep] = await live();
    await recordPayment(db, actor, { invoiceId: String(sep!.id), amount: '5', receivedOn: '2026-10-01', method: 'Cash' });
    expect(await bulkDelete(db, actor, { from: '2026-09-01', to: '2026-10-31' })).toMatchObject({ ok: false, errors: { includePayments: expect.any(String) } });
    expect(await bulkDelete(db, actor, { from: '2026-09-01', to: '2026-10-31', studentIds: `${kids[0]!.id}`, includePayments: 'on' })).toEqual({ ok: true, invoices: 2, payments: 1 });
    expect(await live()).toHaveLength(0);
    expect((await db.select().from(auditLog)).some((a) => a.action.startsWith('Bulk deleted 2 invoices and 1 payment'))).toBe(true);
  });

  it('marking someone left can drop unpaid invoices after the left date only', async () => {
    const { actor, year, kids } = await setup(1);
    await generateInvoices(db, actor, year.id, { scope: 'year' }, { today: TODAY });
    expect(await dropUnpaidAfter(db, [kids[0]!.id], '2026-10-15')).toBe(8);
    expect((await live()).map((r) => r.periodFrom)).toEqual(['2026-09-01', '2026-10-01']);
  });
});

describe('discounts, modify, reminders, diagnose', () => {
  it('sibling discounts go to the 2nd and later children by age, leaving manual adjustments alone', async () => {
    const { actor, kids } = await setup(3);
    for (const [a, b] of [[kids[0]!.id, kids[1]!.id], [kids[1]!.id, kids[2]!.id]]) await db.insert(siblingLink).values({ studentA: a!, studentB: b! });
    const set = await saveSet(db, actor, { title: 'Family', rules: [{ position: '2', kind: 'deduct', amount: '10', unit: 'percent' }] });
    expect(set.ok).toBe(true);
    await setAdjustments(db, actor, { studentIds: [kids[2]!.id], kind: 'deduct', amount: '1', unit: 'pence' });
    expect(await assignSiblingDiscounts(db, actor, set.ok ? set.id : 0)).toEqual({ ok: true, assigned: 1, skipped: 1 });
    const adj = await db.select().from(feeAdjustment);
    expect(adj.find((a) => a.studentId === kids[1]!.id)).toMatchObject({ kind: 'deduct', amount: 1000, unit: 'percent', source: 'sibling' });
    expect(adj.find((a) => a.studentId === kids[0]!.id)).toBeUndefined();
    expect(adj.find((a) => a.studentId === kids[2]!.id)).toMatchObject({ source: 'manual', amount: 100 });
  });

  it('modify invoices previews first and skips rows that would go below what is received', async () => {
    const { actor, year } = await setup(2);
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    const [first] = await live();
    await recordPayment(db, actor, { invoiceId: String(first!.id), amount: '30', receivedOn: '2026-10-01', method: 'Cash' });
    const input = { yearId: String(year.id), whereAmount: '30', setAmount: '25' };
    const pv = await previewModify(db, input);
    expect(pv.ok && pv.changes.filter((c) => c.problem)).toHaveLength(1);
    expect(await applyModify(db, actor, input)).toEqual({ ok: true, n: 3, skipped: 1 });
    expect((await live()).map((r) => r.amountPence).sort()).toEqual([2500, 2500, 2500, 3000]);
  });

  it('reminders list overdue balances and diagnose finds duplicates and billing after leaving', async () => {
    const { actor, year, kids } = await setup(1);
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    expect((await reminders(db, { show: 'overdue' })).length).toBe(2);
    expect((await reminders(db, { show: 'overdue', min: 3001 })).length).toBe(0);
    await saveInvoice(db, actor, { type: 'Fees', studentId: String(kids[0]!.id), academicYearId: String(year.id), invoiceDate: '2026-09-01', dueDate: '2026-09-07', periodFrom: '2026-09-01', periodTo: '2026-09-30', amount: '30' });
    await db.update(student).set({ leftDate: '2026-09-15', status: 'Relocated/Left' }).where(eq(student.id, kids[0]!.id));
    const kinds = (await diagnose(db)).map((p) => p.kind);
    expect(kinds).toContain('Possible duplicate');
    expect(kinds).toContain('Billed after leaving');
  });
});

describe('import', () => {
  it('checks every row, then creates invoices and payments only from good rows', async () => {
    const { actor, year, kids } = await setup(1);
    const rows: Record<string, string>[] = [
      { student_id: String(kids[0]!.id), invoice_date: '01/09/2026', due_date: '07/09/2026', amount: '30', payment_amount: '30', payment_date: '02/09/2026', payment_method: 'bank transfer' },
      { student_id: '9999', invoice_date: '01/09/2026', due_date: '07/09/2026', amount: '30' },
      { student_id: String(kids[0]!.id), invoice_date: '31/02/2026', due_date: '07/09/2026', amount: 'abc' }
    ];
    const checked = await checkFeeRows(db, rows, year.id);
    expect(checked.map((r) => r.ok)).toEqual([true, false, false]);
    expect(checked[2]!.errors.join(' ')).toMatch(/invoice_date isn’t a date.*amount isn’t an amount/);
    expect(await commitFeeRows(db, actor, checked, year.id)).toEqual({ added: 1, updated: 0, skipped: 2, payments: 1 });
    expect((await db.select().from(payment))[0]).toMatchObject({ method: 'Bank Transfer', status: 'Cleared', amountPence: 3000 });
  });
});

describe('gateway webhooks', () => {
  it('verify signatures and apply each event once', async () => {
    const { actor, year, kids } = await setup(1);
    await generateInvoices(db, actor, year.id, { scope: 'today' }, { today: TODAY });
    const [inv] = await live();
    await db.insert(payment).values({ invoiceId: inv!.id, amountPence: 3000, receivedOn: '2026-10-01', method: 'Online', status: 'Pending', gatewayProvider: 'stripe', gatewayPaymentId: 'pi_test_1' });
    const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_test_1' } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex')}`;
    expect(verifyStripe(body, sig, 'whsec_test')).toBe(true);
    expect(verifyStripe(body, sig, 'other')).toBe(false);
    expect(verifyStripe(body, sig, 'whsec_test', Date.now() + 600_000)).toBe(false);
    expect(await handleStripe(db, JSON.parse(body))).toBe('applied');
    expect((await db.select().from(payment))[0]!.status).toBe('Cleared');
    await db.update(payment).set({ status: 'Pending' });
    expect(await handleStripe(db, JSON.parse(body))).toBe('duplicate');
    expect((await db.select().from(payment))[0]!.status).toBe('Pending');

    const gc = JSON.stringify({ events: [{ id: 'EV1', resource_type: 'mandates', action: 'active', links: { mandate: 'MD1' } }, { id: 'EV2', resource_type: 'payments', action: 'failed', links: { payment: 'PM1' } }] });
    expect(verifyGoCardless(gc, createHmac('sha256', 'gc_secret').update(gc).digest('hex'), 'gc_secret')).toBe(true);
    expect(verifyGoCardless(gc, 'nope', 'gc_secret')).toBe(false);
    expect(await handleGoCardless(db, JSON.parse(gc).events)).toBe(1);
    expect(await handleGoCardless(db, JSON.parse(gc).events)).toBe(0);
    expect(await db.select().from(directDebitMandate).where(and(eq(directDebitMandate.mandateId, 'MD1'), eq(directDebitMandate.status, 'active')))).toHaveLength(1);
    expect(kids).toHaveLength(1);
  });
});
