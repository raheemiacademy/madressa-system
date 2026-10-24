import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import {
  academicYear, classAssignment, classTeacher, contact, directDebitMandate, forumCategory, homeworkStudent, invoice, messageThread, payment, setting, sharedDoc,
  fileObject, schoolClass, student, studentContact, teacher
} from '@/db/schema';
import { handleStripe } from '@/server/fees/gateways';
import { saveHomework } from '@/server/learning/homework';
import { childOf, classOf, parentContext, PortalDenied, teacherContext } from '@/server/portal/access';
import { bankTransfer, collectDirectDebits, familyFees, finishDirectDebit, startCardPayment, startDirectDebit } from '@/server/portal/fees';
import { partyInbox, partyThread, recipientsFor } from '@/server/portal/messages';
import { childHomework, confirmDetails, sentRequests, setWalkHome, unconfirmed, uploadHomework } from '@/server/portal/parent';
import { docsFor, portalCanSee, visibleCategories } from '@/server/portal/shared';
import { createHolidayRequest } from '@/server/attendance/requests';
import { startFromPortal } from '@/server/comm/messages';
import { sniffMime } from '@/server/storage';
import { db, makeStaff, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => sql.end());
process.env.PAYMENTS_FAKE = '1';

const pdf = (name = 'work.pdf') => new File([Buffer.from('%PDF-1.4 sample')], name, { type: 'application/pdf' });
const tab = (key: string, value: Record<string, unknown>) => db.insert(setting).values({ tab: key, value }).onConflictDoUpdate({ target: setting.tab, set: { value } });

/** Two families and two classes: Parent A has Kid A1 (class 1) and Kid A2 (class 2, left the school); Parent B has Kid B (class 1). */
async function school() {
  const { actor } = await makeStaff({ isSuper: true });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [c1, c2] = await db.insert(schoolClass).values([{ academicYearId: y!.id, name: 'Portal One' }, { academicYearId: y!.id, name: 'Portal Two' }]).returning();
  const [a1, a2, b, emerg] = await db.insert(student).values([
    { firstName: 'Kid', surname: 'A1', status: 'Current' }, { firstName: 'Kid', surname: 'A2', status: 'Relocated/Left' }, { firstName: 'Kid', surname: 'B', status: 'Current' }, { firstName: 'Kid', surname: 'E', status: 'Current' }
  ]).returning();
  await db.insert(classAssignment).values([{ studentId: a1!.id, classId: c1!.id, fromDate: '2026-09-01' }, { studentId: a2!.id, classId: c2!.id, fromDate: '2026-09-01' }, { studentId: b!.id, classId: c1!.id, fromDate: '2026-09-01' }]);
  const [pa, pb] = await db.insert(contact).values([{ name: 'Parent A', email: 'parent.a@example.org', gender: 'Female' }, { name: 'Parent B', email: 'parent.b@example.org' }]).returning();
  await db.insert(studentContact).values([
    { studentId: a1!.id, contactId: pa!.id, type: 'Parent', isPrimary: true }, { studentId: a2!.id, contactId: pa!.id, type: 'Parent', isPrimary: true },
    { studentId: b!.id, contactId: pb!.id, type: 'Parent', isPrimary: true }, { studentId: emerg!.id, contactId: pa!.id, type: 'Emergency', isPrimary: false }
  ]);
  const [t1, t2] = await db.insert(teacher).values([{ name: 'Teacher One', gender: 'Female' }, { name: 'Teacher Two' }]).returning();
  await db.insert(classTeacher).values([{ classId: c1!.id, teacherId: t1!.id, canRegister: true, canHomework: true, canMessage: true }, { classId: c2!.id, teacherId: t2!.id, canRegister: true }]);
  return { actor, year: y!, c1: c1!, c2: c2!, a1: a1!, a2: a2!, b: b!, emerg: emerg!, pa: pa!, pb: pb!, t1: t1!, t2: t2! };
}
const pActor = { identityId: null as unknown as number, name: 'Parent A' };

describe('portal access', () => {
  it('a parent sees only their own current children, as an allowed contact type, and nobody else’s', async () => {
    const s = await school();
    const ctx = await parentContext(db, s.pa.id);
    expect(ctx.kids.map((k) => k.surname)).toEqual(['A1']); // A2 has left; E is linked only as an emergency contact
    expect(childOf(ctx, s.a1.id).className).toBe('Portal One');
    expect(() => childOf(ctx, s.b.id)).toThrow(PortalDenied);
    await tab('parentPortal', { contactTypesAllowed: ['Parent', 'Emergency'] });
    expect((await parentContext(db, s.pa.id)).kids.map((k) => k.surname).sort()).toEqual(['A1', 'E']);
  });

  it('a teacher reaches only their classes, and only with the privilege the class gives them', async () => {
    const s = await school();
    const ctx = await teacherContext(db, s.t1.id);
    expect(ctx.classes.map((c) => c.name)).toEqual(['Portal One']);
    expect(classOf(ctx, s.c1.id, 'canHomework').name).toBe('Portal One');
    expect(() => classOf(ctx, s.c1.id, 'canIncidents')).toThrow(PortalDenied);
    expect(() => classOf(ctx, s.c2.id)).toThrow(PortalDenied);
  });
});

describe('parent portal', () => {
  it('hands in homework only where uploads are allowed and still open, and only for their own child', async () => {
    const s = await school();
    const ctx = await parentContext(db, s.pa.id);
    const open = await saveHomework(db, s.actor, { classId: String(s.c1.id), title: 'Upload me', deadline: '2030-01-01T17:00', allowUploads: 'on' });
    const noUploads = await saveHomework(db, s.actor, { classId: String(s.c1.id), title: 'Paper only', deadline: '2030-01-01T17:00' });
    const locked = await saveHomework(db, s.actor, { classId: String(s.c1.id), title: 'Too late', deadline: '2026-09-02T17:00', allowUploads: 'on', lockAfterDeadline: 'on' });
    if (!open.ok || !noUploads.ok || !locked.ok) throw new Error('setup');
    expect(await uploadHomework(db, pActor, ctx, s.a1.id, open.id, pdf())).toEqual({ ok: true });
    expect(await uploadHomework(db, pActor, ctx, s.a1.id, noUploads.id, pdf())).toMatchObject({ ok: false, error: 'This homework doesn’t take uploads' });
    expect(await uploadHomework(db, pActor, ctx, s.a1.id, locked.id, pdf())).toMatchObject({ ok: false, error: 'This homework is locked' });
    expect(await uploadHomework(db, pActor, ctx, s.a1.id, open.id, new File(['<html>'], 'x.html'))).toMatchObject({ ok: false });
    await expect(uploadHomework(db, pActor, ctx, s.b.id, open.id, pdf())).rejects.toThrow(PortalDenied);
    const hw = await childHomework(db, ctx.kids[0]!);
    expect(hw.find((h) => h.id === open.id)).toMatchObject({ status: 'Handed in' });
    expect(hw.find((h) => h.id === locked.id)).toMatchObject({ status: 'Missed', canUpload: false });
    // The hand-in is visible to this parent and the class teacher, not to the other family.
    const [row] = await db.select().from(homeworkStudent).where(and(eq(homeworkStudent.homeworkId, open.id), eq(homeworkStudent.studentId, s.a1.id)));
    const fileId = row!.uploadFileId!;
    expect(await portalCanSee(db, { party: { kind: 'contact', id: s.pa.id }, audience: 'parents', classIds: [s.c1.id], studentIds: [s.a1.id] }, fileId)).toBe(true);
    expect(await portalCanSee(db, { party: { kind: 'contact', id: s.pb.id }, audience: 'parents', classIds: [s.c1.id], studentIds: [s.b.id] }, fileId)).toBe(false);
    expect(await portalCanSee(db, { party: { kind: 'teacher', id: s.t1.id }, audience: 'teachers', classIds: [s.c1.id], studentIds: [] }, fileId)).toBe(true);
    expect(await portalCanSee(db, { party: { kind: 'teacher', id: s.t2.id }, audience: 'teachers', classIds: [s.c2.id], studentIds: [] }, fileId)).toBe(false);
  });

  it('lists the holiday requests sent for this family only', async () => {
    const s = await school();
    await createHolidayRequest(db, s.pa.id, { studentIds: [s.a1.id], startsOn: '2026-12-14', endsOn: '2026-12-15', request: 'Wedding' });
    await createHolidayRequest(db, s.pb.id, { studentIds: [s.b.id], startsOn: '2026-12-14', endsOn: '2026-12-15', request: 'Trip' });
    const sent = await sentRequests(db, await parentContext(db, s.pa.id));
    expect(sent.requests.map((r) => r.r.request)).toEqual(['Wedding']);
  });

  it('pays by card: one pending payment per unpaid invoice, cleared only by the Stripe webhook', async () => {
    const s = await school();
    await tab('gateways', { stripeEnabled: true });
    await db.insert(invoice).values([
      { studentId: s.a1.id, academicYearId: s.year.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 2500 },
      { studentId: s.a1.id, academicYearId: s.year.id, invoiceDate: '2026-10-01', dueDate: '2026-10-07', amountPence: 2500 },
      { studentId: s.b.id, academicYearId: s.year.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 9900 }
    ]);
    const ctx = await parentContext(db, s.pa.id);
    expect((await familyFees(db, ctx)).outstanding).toBe(5000);
    const r = await startCardPayment(db, pActor, ctx);
    if (!r.ok) throw new Error(r.error);
    const pays = await db.select().from(payment);
    expect(pays).toHaveLength(2);
    expect(pays.every((p) => p.status === 'Pending' && p.gatewayProvider === 'stripe' && p.amountPence === 2500)).toBe(true);
    expect(await startCardPayment(db, pActor, ctx)).toMatchObject({ ok: false, error: 'There’s nothing to pay' }); // already being paid
    await handleStripe(db, { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: pays[0]!.gatewayPaymentId! } } });
    expect((await familyFees(db, ctx)).outstanding).toBe(0);
  });

  it('sets up direct debit for this parent and collects what’s due once', async () => {
    const s = await school();
    await tab('gateways', { gocardlessEnabled: true });
    const ctx = await parentContext(db, s.pa.id);
    const start = await startDirectDebit(db, pActor, ctx);
    if (!start.ok) throw new Error(start.error);
    const br = new URL(start.url, 'http://x').searchParams.get('billing_request')!;
    expect(await finishDirectDebit(db, pActor, ctx, br)).toEqual({ ok: true });
    expect((await db.select().from(directDebitMandate))[0]).toMatchObject({ contactId: s.pa.id, status: 'pending_submission' });
    await db.insert(invoice).values({ studentId: s.a1.id, academicYearId: s.year.id, invoiceDate: '2026-09-01', dueDate: '2026-09-07', amountPence: 2500 });
    expect(await collectDirectDebits(db, { identityId: null, name: 'Daily' }, { dueBy: '2026-09-30' })).toBe(1);
    expect(await collectDirectDebits(db, { identityId: null, name: 'Daily' }, { dueBy: '2026-09-30' })).toBe(0); // pending, not collected twice
    expect((await db.select().from(payment))[0]).toMatchObject({ method: 'Direct Debit', status: 'Pending', gatewayProvider: 'gocardless' });
  });

  it('builds the bank transfer reference from the template', async () => {
    const s = await school();
    await tab('fees', { bankAccountName: 'Sample Academy', bankAccountNumber: '12345678', bankSortCode: '12-34-56', bankReference: 'FEES-{CONTACT_ID}-S{STUDENT_IDS}-{NUMBER_OF_INVOICES}' });
    const b = await bankTransfer(db, await parentContext(db, s.pa.id), 2);
    expect(b?.reference).toBe(`FEES-${s.pa.id}-S${s.a1.id}-2`);
  });

  it('asks for details once a year when the school requires it, and walk-home consent only when asked for', async () => {
    const s = await school();
    await tab('parentPortal', { forceConfirmDetails: true });
    let ctx = await parentContext(db, s.pa.id);
    expect((await unconfirmed(db, ctx)).map((k) => k.id)).toEqual([s.a1.id]);
    await confirmDetails(db, pActor, ctx, s.a1.id);
    expect(await unconfirmed(db, ctx)).toEqual([]);
    expect(await setWalkHome(db, pActor, ctx, s.a1.id, true)).toMatchObject({ ok: false });
    await tab('parentPortal', { walkHomeConsent: true });
    ctx = await parentContext(db, s.pa.id);
    expect(await setWalkHome(db, pActor, ctx, s.a1.id, true)).toEqual({ ok: true });
    await expect(setWalkHome(db, pActor, ctx, s.b.id, true)).rejects.toThrow(PortalDenied);
  });
});

describe('messages, forums and shared files in the portals', () => {
  it('offers only the routes the school allows, and opens only your own conversations', async () => {
    const s = await school();
    await tab('messaging', { contactsToAdmins: true, contactsToTeachersAll: true, teachersToAdmins: true, teachersToPrimaryContacts: true });
    const pa = { kind: 'contact' as const, id: s.pa.id, name: 'Parent A' };
    expect((await recipientsFor(db, pa, [s.c1.id])).map((r) => r.value)).toEqual(['admin:0', `teacher:${s.t1.id}`]);
    expect((await recipientsFor(db, pa, [s.c2.id])).map((r) => r.value)).toEqual(['admin:0']); // Teacher Two has no Messaging privilege
    const t1 = { kind: 'teacher' as const, id: s.t1.id, name: 'Teacher One' };
    expect((await recipientsFor(db, t1, [s.c1.id])).map((r) => r.value)).toEqual(['admin:0', `teacher:${s.t2.id}`, `contact:${s.pa.id}`, `contact:${s.pb.id}`]); // colleagues: on by default
    const r = await startFromPortal(db, pa, { kind: 'teacher', id: s.t1.id }, 'Question', 'When is the trip?');
    if (!r.ok) throw new Error(r.error);
    expect((await partyInbox(db, t1)).map((t) => [t.subject, t.unread])).toEqual([['Question', true]]);
    expect((await partyThread(db, t1, r.id))?.messages).toHaveLength(1);
    expect((await partyInbox(db, t1))[0]!.unread).toBe(false);
    expect(await partyThread(db, { kind: 'contact', id: s.pb.id }, r.id)).toBeNull();
    expect(await db.select().from(messageThread)).toHaveLength(1);
  });

  it('shows forums and shared documents to everyone, or only to the classes named', async () => {
    const s = await school();
    await db.insert(forumCategory).values([{ name: 'Everyone' }, { name: 'Class two only', classIds: [s.c2.id] }]);
    expect((await visibleCategories(db, [s.c1.id])).map((c) => c.c.name)).toEqual(['Everyone']);
    expect((await visibleCategories(db, [s.c2.id])).map((c) => c.c.name)).toEqual(['Class two only', 'Everyone']);
    const files = await db.insert(fileObject).values([1, 2, 3].map((i) => ({ storageKey: `t/${i}`, filename: `f${i}.pdf`, mime: 'application/pdf', size: 1, purpose: 'shared-doc' }))).returning();
    await db.insert(sharedDoc).values([
      { title: 'Term dates', fileId: files[0]!.id, audience: 'parents', createdBy: 'Office' },
      { title: 'Class two letter', fileId: files[1]!.id, audience: 'both', classIds: [s.c2.id], createdBy: 'Office' },
      { title: 'Staff handbook', fileId: files[2]!.id, audience: 'teachers', createdBy: 'Office' }
    ]);
    expect((await docsFor(db, 'parents', [s.c1.id])).map((d) => d.title)).toEqual(['Term dates']);
    expect((await docsFor(db, 'teachers', [s.c2.id])).map((d) => d.title).sort()).toEqual(['Class two letter', 'Staff handbook']);
    expect(await portalCanSee(db, { party: { kind: 'contact', id: s.pa.id }, audience: 'parents', classIds: [s.c1.id], studentIds: [s.a1.id] }, files[2]!.id)).toBe(false);
  });
});

it('recognises phone recordings as homework uploads', () => {
  expect(sniffMime(Buffer.from('ID3\u0004\u0000'))).toBe('audio/mpeg');
  expect(sniffMime(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A ')]))).toBe('audio/mp4');
  expect(sniffMime(Buffer.from('OggS\u0000'))).toBe('audio/ogg');
  expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
});
