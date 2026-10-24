import { isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, classAssignment, contact, eotyParagraph, examResult, homeworkStudent, invoice, mailQueue, merit, payment, product, schoolClass, smsMessage, student, studentContact } from '@/db/schema';
import { buildReport, fillParagraph, saveEntries, saveParagraphs, saveReport, DEFAULT_PARAGRAPHS } from '@/server/learning/eoty';
import { getEvent, makeSlots, recordOptIn, saveEvent, withdrawOptIn } from '@/server/learning/events';
import { examResults, gradeFor, parseMark, saveExam, saveGradeSystem, saveResults, saveTest, setExamStatus, STANDARD_GRADES } from '@/server/learning/exams';
import { lockTopic, post, saveCategory } from '@/server/learning/forums';
import { incomplete, saveHomework, sendReminders, setCompleted, yearReport } from '@/server/learning/homework';
import { saveIncident } from '@/server/learning/incidents';
import { achievementInput, awardMerits, certificatePdf, issueCertificates, reached, saveCompetition, saveTeam, standings, studentTotals } from '@/server/learning/merits';
import { createSale, saveProduct } from '@/server/learning/products';
import { db, makeStaff, resetDb } from './helpers';
import { achievement } from '@/db/schema';

beforeEach(resetDb);
afterAll(() => sql.end());

async function school(n = 3) {
  const { actor, staff } = await makeStaff({ isSuper: true });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  const [c] = await db.insert(schoolClass).values({ academicYearId: y!.id, name: 'Learning Class' }).returning();
  const kids = [];
  for (let i = 0; i < n; i++) {
    const [s] = await db.insert(student).values({ firstName: `Kid${i}`, surname: 'Learn', status: 'Current', gender: i % 2 ? 'Male' : 'Female' }).returning();
    await db.insert(classAssignment).values({ studentId: s!.id, classId: c!.id, fromDate: '2026-09-01' });
    const [p] = await db.insert(contact).values({ name: `Parent ${i}`, email: `parent${i}.learn@example.org`, mobile: `07700 90050${i}` }).returning();
    await db.insert(studentContact).values({ studentId: s!.id, contactId: p!.id, type: 'Parent', isPrimary: true });
    kids.push(s!);
  }
  return { actor: { ...actor, email: staff.email }, year: y!, cls: c!, kids };
}

describe('homework', () => {
  it('sets for the whole class, emails contacts, tracks completion and reports', async () => {
    const s = await school(3);
    const r = await saveHomework(db, s.actor, { classId: String(s.cls.id), title: 'Read chapter 2', deadline: '2026-01-10T18:00', notifyContacts: 'on', instructions: 'Pages 10–20' });
    expect(r).toMatchObject({ ok: true, students: 3, emailed: 3 });
    const id = r.ok ? r.id : 0;
    await setCompleted(db, s.actor, id, [s.kids[0]!.id]);
    expect((await db.select().from(homeworkStudent).where(isNull(homeworkStudent.completedAt)))).toHaveLength(2);
    const pending = await incomplete(db);
    expect(pending).toHaveLength(2); // deadline passed
    expect(await sendReminders(db, s.actor, pending.map((p) => [p.homeworkId, p.studentId]), true)).toBe(1); // test goes only to the admin
    expect(await sendReminders(db, s.actor, pending.map((p) => [p.homeworkId, p.studentId]))).toBe(2);
    const rep = await yearReport(db, s.year.id);
    expect(rep.find((x) => x.studentId === s.kids[0]!.id)).toMatchObject({ total: 1, completed: 1, pct: 100 });
    expect(await saveHomework(db, s.actor, { classId: String(s.cls.id), title: 'X', deadline: 'tomorrow' })).toMatchObject({ ok: false });
  });
});

describe('exams', () => {
  it('parses marks, refuses marks over the maximum, ranks ties together and respects locking', async () => {
    expect(parseMark('45.5')).toEqual({ tenths: 455, absent: false });
    expect(parseMark('abs')).toEqual({ tenths: null, absent: true });
    expect(parseMark('4.55')).toBeNull();
    expect(gradeFor(85, STANDARD_GRADES.map(([minPct, grade]) => ({ minPct, grade })))).toBe('A');
    const s = await school(3);
    const g = await saveGradeSystem(db, s.actor, { name: 'Standard', isDefault: true, bands: STANDARD_GRADES.map(([minPct, grade]) => ({ minPct, grade })) });
    expect(g.ok).toBe(true);
    const e = await saveExam(db, s.actor, { classId: String(s.cls.id), official: 'official', title: 'Autumn exam', date: '2026-12-01' });
    const eid = e.ok ? e.id : 0;
    await saveTest(db, s.actor, eid, { name: 'Quran', maxMarks: '50' });
    await saveTest(db, s.actor, eid, { name: 'Fiqh', maxMarks: '50' });
    const [t1, t2] = (await examResults(db, eid))!.tests;
    const cell = (t: number, k: number, v: string) => ({ [`${t}:${s.kids[k]!.id}`]: v });
    expect(await saveResults(db, s.actor, eid, { ...cell(t1!.t.id, 0, '51') })).toMatchObject({ ok: false, error: expect.stringContaining('more than 50') });
    expect(await saveResults(db, s.actor, eid, { ...cell(t1!.t.id, 0, '45'), ...cell(t2!.t.id, 0, '40'), ...cell(t1!.t.id, 1, '45'), ...cell(t2!.t.id, 1, '40'), ...cell(t1!.t.id, 2, 'abs'), ...cell(t2!.t.id, 2, '20') })).toMatchObject({ ok: true });
    const res = (await examResults(db, eid))!;
    expect(res.rows.map((r) => [r.pct, r.grade, r.position])).toEqual([[85, 'A', 1], [85, 'A', 1], [40, 'E', 3]]);
    await setExamStatus(db, s.actor, eid, 'locked');
    expect(await saveResults(db, s.actor, eid, cell(t1!.t.id, 0, '10'))).toMatchObject({ ok: false, error: 'This exam is locked' });
    expect((await db.select().from(examResult)).length).toBe(6);
  });
});

describe('EOTY reports', () => {
  it('fills paragraphs by score with pronouns and builds a report from term data only', async () => {
    expect(fillParagraph('{FIRST_NAME} tries. {HE_SHE} works hard on {HIS_HER} reading.', { firstName: 'Sam', surname: 'Test', gender: 'Male' }, 'Good')).toBe('Sam tries. He works hard on his reading.');
    // Without a recorded gender the first name stands in for the pronoun.
    expect(fillParagraph('{HE_SHE} works hard on {HIS_HER} reading', { firstName: 'Sam', surname: 'B', gender: 'Unspecified' }, '')).toBe('Sam works hard on Sam’s reading');
    const s = await school(2);
    const r = await saveReport(db, s.actor, s.year.id, { title: 'Autumn report', termStart: '2026-09-01', termEnd: '2026-12-20', includeExams: true, includePositions: true, includeAttendance: true, includeHomework: true, scoring: true, active: true, teachersCanDownload: false, scoreLabels: ['Low', 'Fair', 'Good', 'Very good', 'Excellent'], questions: ['Behaviour', 'Progress', 'Effort'] });
    expect(r.ok).toBe(true);
    const rid = r.ok ? r.id : 0;
    await saveEntries(db, s.actor, rid, [{ studentId: s.kids[0]!.id, scores: [5, 3, 9], comment: 'A lovely term.' }]);
    const rep = (await buildReport(db, rid, s.kids[0]!.id, s.cls.id))!;
    expect(rep.scored.map((x) => [x.question, x.score, x.label])).toEqual([['Behaviour', 5, 'Excellent'], ['Progress', 3, 'Good'], ['Effort', 0, '']]);
    expect(rep.scored[0]!.paragraph).toContain('Kid0’s behaviour is excellent. She is courteous');
    expect(rep.comment).toBe('A lovely term.');
    const defaults = { behaviour: [...DEFAULT_PARAGRAPHS.behaviour], progress: [...DEFAULT_PARAGRAPHS.progress], effort: [...DEFAULT_PARAGRAPHS.effort] };
    defaults.effort[0] = 'Custom effort text.';
    expect(await saveParagraphs(db, s.actor, defaults)).toEqual({ ok: true });
    expect(await db.select().from(eotyParagraph)).toHaveLength(1);
  });
});

describe('incidents', () => {
  it('needs the right person for its kind and can email and text a student’s contacts', async () => {
    const s = await school(1);
    expect(await saveIncident(db, s.actor, { kind: 'teacher', severity: 'Low', occurredAt: '2026-10-01T10:00', title: 'T', report: 'R' })).toMatchObject({ ok: false, errors: { teacherId: expect.any(String) } });
    const r = await saveIncident(db, s.actor, { kind: 'student', studentId: String(s.kids[0]!.id), classId: String(s.cls.id), severity: 'Medium', occurredAt: '2026-10-01T10:00', title: 'Fell over', report: 'Grazed knee in the playground.', action: 'First aid given', emailContacts: 'on', smsContacts: 'on' });
    expect(r).toMatchObject({ ok: true, emailed: 1, texted: 1 });
    expect((await db.select().from(mailQueue))[0]!.subject).toBe('Incident report: Kid0 Learn');
    expect((await db.select().from(smsMessage))[0]!.body).toContain('Kid0 Learn');
  });
});

describe('merits, shop and certificates', () => {
  it('awards merits, spends them in the shop, raises invoices for paid sales and tracks stock', async () => {
    const s = await school(2);
    const [m] = await db.insert(merit).values({ name: 'Star', points: 5, forStudents: true }).returning();
    expect(await awardMerits(db, s.actor, { meritId: String(m!.id), teacherIds: ['1'], awardedOn: '2026-10-01' })).toMatchObject({ ok: false });
    expect(await awardMerits(db, s.actor, { meritId: String(m!.id), studentIds: s.kids.map((k) => String(k.id)), awardedOn: '2026-10-01', comment: 'Great work' })).toEqual({ ok: true, n: 2 });
    await saveProduct(db, s.actor, { name: 'Pencil', price: '0.50', meritPrice: '3', stock: '2', active: 'on' }, undefined);
    const [pencil] = await db.select().from(product);
    const sale = (o: Record<string, string>) => createSale(db, s.actor, { productId: String(pencil!.id), target: 'student', studentId: String(s.kids[0]!.id), qty: '1', pay: 'merits', soldOn: '2026-10-02', ...o });
    expect(await sale({})).toEqual({ ok: true, n: 1 });
    expect(await sale({})).toMatchObject({ ok: false, errors: { pay: expect.stringContaining('enough merits') } }); // 5 − 3 = 2 left
    expect(await sale({ pay: 'invoice' })).toEqual({ ok: true, n: 1 });
    expect(await sale({ pay: 'invoice' })).toMatchObject({ ok: false, errors: { qty: 'Only 0 left in stock' } });
    expect((await db.select().from(invoice))[0]).toMatchObject({ type: 'Products', amountPence: 50 });
    expect((await studentTotals(db)).find((t) => t.id === s.kids[0]!.id)).toMatchObject({ points: 5, spent: 3, balance: 2 });
  });

  it('finds students who reached an achievement, issues certificates as real PDFs, and totals team competitions', async () => {
    const s = await school(2);
    const [m] = await db.insert(merit).values({ name: 'Helper', points: 2 }).returning();
    await awardMerits(db, s.actor, { meritId: String(m!.id), studentIds: [String(s.kids[0]!.id)], awardedOn: '2026-10-01' });
    await awardMerits(db, s.actor, { meritId: String(m!.id), studentIds: [String(s.kids[0]!.id)], awardedOn: '2026-10-02' });
    const [a] = await db.insert(achievement).values(achievementInput.parse({ name: 'Helper badge', meritId: String(m!.id), target: '2', badge: 'gold', forStudents: 'on', enabled: 'on' })).returning();
    expect((await reached(db, a!.id)).map((x) => x.id)).toEqual([s.kids[0]!.id]);
    const issued = await issueCertificates(db, s.actor, { studentIds: [String(s.kids[0]!.id)], achievementId: String(a!.id), badge: 'gold', forText: 'Being a great helper', issuedOn: '2026-10-03', onPortal: 'on' });
    expect(issued.ok).toBe(true);
    expect(await reached(db, a!.id)).toHaveLength(0);
    const pdf = await certificatePdf(db, issued.ok ? issued.ids[0]! : 0);
    expect(Buffer.from(pdf!.bytes).subarray(0, 5).toString()).toBe('%PDF-');
    await saveTeam(db, s.actor, { name: 'Red', colour: 'violet', classIds: [String(s.cls.id)] });
    await saveCompetition(db, s.actor, { name: 'Autumn cup', startsOn: '2026-09-01', endsOn: '2026-12-31' });
    const st = await standings(db, 1);
    expect(st!.rows[0]).toMatchObject({ points: 4 });
  });
});

describe('events and forums', () => {
  it('requires consents, invoices once, and withdrawing removes an unpaid invoice', async () => {
    const s = await school(1);
    expect(makeSlots(['2026-11-01'], '10:00', '11:00', 20).map((x) => x.from)).toEqual(['10:00', '10:20', '10:40']);
    const e = await saveEvent(db, s.actor, s.year.id, { name: 'Museum trip', date: '2026-11-20', autoInvoice: 'on', active: 'on',
      consents: [{ text: 'Photos may be taken', required: false }, { text: 'I give permission', required: true }], prices: [{ description: 'Coach', price: '8', required: true }, { description: 'Lunch', price: '3.50', required: false }] });
    const eid = e.ok ? e.id : 0;
    const ev = (await getEvent(db, eid))!;
    const [photos, permission] = ev.consents;
    const lunch = ev.prices.find((p) => p.description === 'Lunch')!;
    expect(await recordOptIn(db, s.actor, eid, { studentId: String(s.kids[0]!.id), consentIds: [String(photos!.id)] })).toMatchObject({ ok: false, error: expect.stringContaining('I give permission') });
    expect(await recordOptIn(db, s.actor, eid, { studentId: String(s.kids[0]!.id), consentIds: [String(permission!.id)], priceIds: [String(lunch.id)] })).toEqual({ ok: true, total: 1150, invoiced: true });
    expect(await recordOptIn(db, s.actor, eid, { studentId: String(s.kids[0]!.id), consentIds: [String(permission!.id)] })).toMatchObject({ ok: false });
    expect(await withdrawOptIn(db, s.actor, eid, s.kids[0]!.id)).toEqual({ ok: true, kept: false });
    expect((await db.select().from(invoice))[0]!.deletedAt).not.toBeNull();
    expect(await db.select().from(payment)).toHaveLength(0);
  });

  it('locked topics take replies from admins only', async () => {
    const s = await school(0);
    await saveCategory(db, s.actor, { name: 'General', classIds: [] });
    const t = await post(db, { kind: 'admin', id: 1, name: 'Admin' }, { categoryId: 1, title: 'Welcome' }, 'Salaam all');
    const tid = t.ok ? t.topicId : 0;
    await lockTopic(db, s.actor, tid, true);
    expect(await post(db, { kind: 'contact', id: 5, name: 'Parent' }, { topicId: tid }, 'Hello')).toMatchObject({ ok: false, error: 'This topic is locked' });
    expect(await post(db, { kind: 'admin', id: 1, name: 'Admin' }, { topicId: tid }, 'Still here')).toMatchObject({ ok: true });
  });
});
