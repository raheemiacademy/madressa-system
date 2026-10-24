// Fictional seed data for local development and e2e tests. Never put real people here.
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/server/auth';
import { createContribution, generateInvoices } from '../src/server/fees/generate';
import { saveSet, setAdjustments } from '../src/server/fees/adjustments';
import { saveStructure } from '../src/server/fees/structures';
import { compose, startFromPortal } from '../src/server/comm/messages';
import { saveNewsletter } from '../src/server/comm/newsletters';
import { saveHomework } from '../src/server/learning/homework';
import { saveExam, saveGradeSystem, saveResults, saveTest, examResults, STANDARD_GRADES } from '../src/server/learning/exams';
import { saveReport, saveEntries } from '../src/server/learning/eoty';
import { saveIncident, saveIncidentTemplate } from '../src/server/learning/incidents';
import { awardMerits, saveMerit } from '../src/server/learning/merits';
import { saveProduct } from '../src/server/learning/products';
import { saveEvent } from '../src/server/learning/events';
import { post, saveCategory } from '../src/server/learning/forums';

const url = process.argv.includes('--test') ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!url) throw new Error('Database URL is not set');
if (!password || password.length < 10) throw new Error('Set SEED_ADMIN_PASSWORD (10+ characters) to seed the sample admin logins');

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
const { adminStaff, loginIdentity, schoolProfile, academicYear, holiday } = schema;
const hash = await hashPassword(password);

await db.insert(schoolProfile).values({ id: 1, name: 'Sample Academy', city: 'Testville', postcode: 'ZZ1 1ZZ', email: 'office@example.org', noReplyEmail: 'no-reply@example.org' }).onConflictDoNothing();

async function staff(name: string, email: string, flags: Partial<typeof adminStaff.$inferInsert>) {
  let [s] = await db.select().from(adminStaff).where(eq(adminStaff.email, email));
  if (!s) [s] = await db.insert(adminStaff).values({ name, email, rank: 'Administrator', ...flags }).returning();
  const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, s!.id));
  if (idn) await db.update(loginIdentity).set({ passwordHash: hash, allowLogin: true, failedAttempts: 0, lockedUntil: null }).where(eq(loginIdentity.id, idn.id));
  else await db.insert(loginIdentity).values({ portal: 'admin', email, passwordHash: hash, adminStaffId: s!.id });
}
await staff('Sample Admin One', 'admin@example.org', { isSuper: true, rank: 'Head Administrator' });
await staff('Sample Clerk Two', 'clerk@example.org', { canEdit: true, rank: 'Secretary' });

const [cur] = await db.select().from(academicYear).where(eq(academicYear.title, '2026/27'));
if (!cur) {
  await db.insert(academicYear).values({ title: '2025/26', startsOn: '2025-09-01', endsOn: '2026-07-31' });
  const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
  await db.insert(holiday).values([
    { academicYearId: y!.id, title: 'Half term', startsOn: '2026-10-26', endsOn: '2026-10-30' },
    { academicYearId: y!.id, title: 'Winter break', startsOn: '2026-12-21', endsOn: '2027-01-01', description: 'Classes restart on Monday 4 January.' }
  ]);
}

// People: obviously fictional names, example.org emails and Ofcom drama-range mobiles (07700 900xxx).
const [anyStudent] = await db.select({ id: schema.student.id }).from(schema.student).limit(1);
const [year] = await db.select().from(academicYear).where(eq(academicYear.title, '2026/27'));
if (!anyStudent && year) {
  const groups = await db.insert(schema.yearGroup).values([
    { label: 'Infants', minAge: 4, maxAge: 6, sortOrder: 1 }, { label: 'Juniors', minAge: 7, maxAge: 10, sortOrder: 2 }, { label: 'Seniors', minAge: 11, maxAge: 16, sortOrder: 3 }
  ]).returning();
  const teachers = await db.insert(schema.teacher).values([
    { name: 'Sample Teacher One', gender: 'Female', email: 'teacher1@example.org', mobile: '07700 900101' },
    { name: 'Sample Teacher Two', gender: 'Male', email: 'teacher2@example.org', mobile: '07700 900102' },
    { name: 'Sample Teacher Three', gender: 'Female', email: 'teacher3@example.org', status: 'Volunteer' }
  ]).returning();
  for (const t of teachers) for (const d of [1, 2, 3, 4]) await db.insert(schema.teacherHours).values({ teacherId: t.id, weekday: d, startTime: '17:00', endTime: '19:30' });
  const classes = await db.insert(schema.schoolClass).values([
    { academicYearId: year.id, name: 'Test Class A', yearGroupId: groups[0]!.id, mainTeacherId: teachers[0]!.id, capacity: 8, startsOn: year.startsOn, endsOn: year.endsOn },
    { academicYearId: year.id, name: 'Test Class B', yearGroupId: groups[1]!.id, mainTeacherId: teachers[1]!.id, capacity: 6, startsOn: year.startsOn, endsOn: year.endsOn },
    { academicYearId: year.id, name: 'Test Class C', yearGroupId: groups[2]!.id, capacity: 10, startsOn: year.startsOn, endsOn: year.endsOn }
  ]).returning();
  for (const c of classes) {
    if (c.mainTeacherId) await db.insert(schema.classTeacher).values({ classId: c.id, teacherId: c.mainTeacherId, canRegister: true, canHomework: true });
    await db.insert(schema.timetableSlot).values({ classId: c.id, weekday: 1, startTime: '17:00', durationMinutes: 120, teacherId: c.mainTeacherId, takesRegister: true });
  }
  for (let i = 1; i <= 21; i++) {
    const n = String(i).padStart(3, '0');
    const waiting = i > 18;
    const cls = classes[(i - 1) % 3]!;
    const [s] = await db.insert(schema.student).values({
      firstName: 'Test', surname: `Student ${n}`, gender: i % 2 ? 'Female' : 'Male', dob: `${2010 + (i % 12)}-0${1 + (i % 9)}-1${i % 9}`,
      status: waiting ? 'Waiting List' : 'Current', startDate: waiting ? null : year.startsOn
    }).returning();
    const [p] = await db.insert(schema.contact).values({ name: `Sample Parent ${n}`, email: `parent${n}@example.org`, mobile: `07700 900${n}` }).returning();
    await db.insert(schema.studentContact).values({ studentId: s!.id, contactId: p!.id, type: 'Parent', relation: i % 2 ? 'Mother' : 'Father', isPrimary: true });
    if (!waiting) await db.insert(schema.classAssignment).values({ studentId: s!.id, classId: (i === 8 || i === 9 ? classes[1]! : cls).id, fromDate: year.startsOn });
  }
}
// Attendance: the last eight Monday registers, a few teacher logs, a parent notice and a holiday request.
const [anySession] = await db.select({ id: schema.registerSession.id }).from(schema.registerSession).limit(1);
if (!anySession && year) {
  const today = new Date().toISOString().slice(0, 10);
  const mondays: string[] = [];
  for (let d = new Date(`${today}T12:00:00Z`); mondays.length < 8; d.setUTCDate(d.getUTCDate() - 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 1 && iso < today && iso >= year.startsOn) mondays.push(iso);
    if (iso < year.startsOn) break;
  }
  const classes = await db.select().from(schema.schoolClass).where(eq(schema.schoolClass.academicYearId, year.id));
  const assigns = await db.select().from(schema.classAssignment);
  const teachers = await db.select().from(schema.teacher);
  for (const [w, date] of mondays.entries()) {
    for (const c of classes) {
      const [s] = await db.insert(schema.registerSession).values({ classId: c.id, date, startTime: '17:00', takenAt: new Date(`${date}T17:10:00Z`) }).returning();
      for (const [i, a] of assigns.filter((x) => x.classId === c.id).entries()) {
        const k = (i + w) % 11;
        await db.insert(schema.attendanceMark).values({ sessionId: s!.id, studentId: a.studentId, mark: k === 3 ? 'late' : k === 7 ? 'absent' : 'present', lateMinutes: k === 3 ? 10 : null, authorised: k === 7 && w % 2 ? true : null, notified: k === 7 });
      }
    }
    for (const t of teachers) await db.insert(schema.teacherLog).values({ teacherId: t.id, date, timeIn: '16:50', timeOut: '19:35', source: 'admin' }).onConflictDoNothing();
  }
  const [firstKid] = await db.select().from(schema.student).where(eq(schema.student.status, 'Current')).limit(1);
  const [parent] = await db.select().from(schema.studentContact).where(eq(schema.studentContact.studentId, firstKid!.id)).limit(1);
  await db.insert(schema.absenceNotice).values({ studentId: firstKid!.id, contactId: parent?.contactId, date: today, kind: 'absent', reason: 'Dentist appointment' });
  const [req] = await db.insert(schema.holidayRequest).values({ contactId: parent?.contactId, startsOn: `${today.slice(0, 4)}-12-14`, endsOn: `${today.slice(0, 4)}-12-17`, request: 'Family visit abroad for a wedding.' }).returning();
  await db.insert(schema.holidayRequestStudent).values({ requestId: req!.id, studentId: firstKid!.id });
}
// Fees: a default monthly structure, Test Class C's own fees, an ad hoc exam fee, invoices to date and a few payments.
const [anyStructure] = await db.select({ id: schema.feeStructure.id }).from(schema.feeStructure).limit(1);
if (!anyStructure && year) {
  const [admin] = await db.select().from(loginIdentity).where(eq(loginIdentity.email, 'admin@example.org'));
  const actor = { identityId: admin!.id, name: 'Seed' };
  const classes = await db.select().from(schema.schoolClass).where(eq(schema.schoolClass.academicYearId, year.id));
  const monthly = (amount: string) => ({ name: 'Monthly', startsOn: year.startsOn, endsOn: year.endsOn, invoiceCount: '10', intervalCount: '1', intervalUnit: 'months', amount, startWeekday: '', dueRule: '7' });
  await saveStructure(db, actor, year.id, { name: 'Standard fees', kind: 'default', periods: [monthly('25')] });
  await saveStructure(db, actor, year.id, { name: 'Seniors fees', kind: 'class', classIds: [String(classes.find((c) => c.name === 'Test Class C')!.id)], periods: [monthly('30')] });
  await saveStructure(db, actor, year.id, { name: 'Exam entry fee', kind: 'adhoc', periods: [{ ...monthly('15'), name: 'Exam entry', invoiceCount: '1', dueRule: '14' }] });
  const kids = await db.select().from(schema.student).where(eq(schema.student.status, 'Current')).orderBy(schema.student.id);
  await setAdjustments(db, actor, { studentIds: [kids[4]!.id], kind: 'deduct', amount: '10', unit: 'percent' });
  await saveSet(db, actor, { title: 'Family discount', rules: [{ position: '2', kind: 'deduct', amount: '10', unit: 'percent' }, { position: '3', kind: 'deduct', amount: '15', unit: 'percent' }] });
  await generateInvoices(db, actor, year.id, { scope: 'today' });
  await createContribution(db, actor, year.id, { audience: 'classes', classIds: [String(classes.find((c) => c.name === 'Test Class A')!.id)], invoiceDate: year.startsOn, dueDate: '2026-10-31', description: 'Sample museum trip', amount: '12.50' });
  const invoices = await db.select().from(schema.invoice).orderBy(schema.invoice.dueDate, schema.invoice.id);
  for (const [i, inv] of invoices.filter((x) => x.periodFrom === year.startsOn).entries()) {
    if (i % 5 === 4) continue; // a few left unpaid, so overdue
    const method = i % 3 === 0 ? 'Bank Transfer' : i % 3 === 1 ? 'Cash' : 'Card';
    await db.insert(schema.payment).values({ invoiceId: inv.id, amountPence: inv.amountPence, receivedOn: '2026-09-05', method, status: 'Cleared', reference: method === 'Bank Transfer' ? `SAMPLE-FEES-S${inv.studentId}` : null, createdBy: admin!.id });
  }
  const oct = invoices.filter((x) => x.periodFrom === '2026-10-01');
  if (oct[0]) await db.insert(schema.payment).values({ invoiceId: oct[0].id, amountPence: oct[0].amountPence, receivedOn: '2026-10-03', method: 'Bank Transfer', status: 'Pending', reference: `SAMPLE-FEES-S${oct[0].studentId}`, createdBy: admin!.id });
  if (oct[1]) await db.insert(schema.payment).values({ invoiceId: oct[1].id, amountPence: oct[1].amountPence, receivedOn: '2026-10-08', method: 'Direct Debit', status: 'Bounced', createdBy: admin!.id });
}
// Communication: a parent's message to the office, an office message to a teacher, and a draft newsletter.
const [anyThread] = await db.select({ id: schema.messageThread.id }).from(schema.messageThread).limit(1);
if (!anyThread && year) {
  const [admin] = await db.select().from(adminStaff).where(eq(adminStaff.email, 'admin@example.org'));
  const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, admin!.id));
  const [parent] = await db.select().from(schema.contact).where(eq(schema.contact.name, 'Sample Parent 001'));
  const [t1] = await db.select().from(schema.teacher).where(eq(schema.teacher.name, 'Sample Teacher One'));
  if (parent) await startFromPortal(db, { kind: 'contact', id: parent.id, name: parent.name }, { kind: 'admin', id: 0 }, 'Away next Monday', 'Salaam, Test Student 001 will be away next Monday for a family event. Thank you.');
  if (t1) await compose(db, { identityId: idn!.id, name: admin!.name, staffId: admin!.id }, { teacherIds: [String(t1.id)], subject: 'Register reminder', body: 'Please remember to take the register at the start of class.' });
  await saveNewsletter(db, { identityId: idn!.id, name: admin!.name }, { subject: 'Sample term newsletter', audience: 'parents', style: 'modern', body: '<p>Dear {NAME},</p><p>Welcome back to a new term at Sample Academy.</p>', signature: 'The office team' });
}
// Learning: merits, homework, an exam with results, a report, an incident, a shop item, a trip and a forum.
const [anyMerit] = await db.select({ id: schema.merit.id }).from(schema.merit).limit(1);
if (!anyMerit && year) {
  const [admin] = await db.select().from(adminStaff).where(eq(adminStaff.email, 'admin@example.org'));
  const [idn] = await db.select().from(loginIdentity).where(eq(loginIdentity.adminStaffId, admin!.id));
  const actor = { identityId: idn!.id, name: admin!.name };
  const classes = await db.select().from(schema.schoolClass).where(eq(schema.schoolClass.academicYearId, year.id));
  const classA = classes.find((c) => c.name === 'Test Class A')!;
  const kidsA = await db.select({ id: schema.classAssignment.studentId }).from(schema.classAssignment).where(eq(schema.classAssignment.classId, classA.id));
  await saveMerit(db, actor, { name: 'Star of the week', points: '5', forStudents: 'on', enabled: 'on', official: 'on' });
  await saveMerit(db, actor, { name: 'Helpful', points: '2', forStudents: 'on', forTeachers: 'on', enabled: 'on' });
  await saveMerit(db, actor, { name: 'Homework missed', points: '-1', forStudents: 'on', enabled: 'on' });
  const merits = await db.select().from(schema.merit);
  await awardMerits(db, actor, { meritId: String(merits[0]!.id), studentIds: kidsA.slice(0, 2).map((k) => String(k.id)), awardedOn: year.startsOn, comment: 'Excellent recitation' });
  await awardMerits(db, actor, { meritId: String(merits[1]!.id), studentIds: kidsA.slice(1, 4).map((k) => String(k.id)), awardedOn: year.startsOn });
  await saveHomework(db, actor, { classId: String(classA.id), title: 'Learn the next five verses', deadline: `${year.startsOn}T17:00`, instructions: 'Practise with a parent each evening.' });
  await saveGradeSystem(db, actor, { name: 'Standard', isDefault: true, bands: STANDARD_GRADES.map(([minPct, grade]) => ({ minPct, grade })) });
  const ex = await saveExam(db, actor, { classId: String(classA.id), official: 'official', title: 'Autumn assessment', date: '2026-10-05' });
  if (ex.ok) {
    await saveTest(db, actor, ex.id, { name: 'Quran', maxMarks: '50' });
    await saveTest(db, actor, ex.id, { name: 'Islamic studies', maxMarks: '50' });
    const r = (await examResults(db, ex.id))!;
    const cells: Record<string, string> = {};
    r.rows.forEach((row, i) => r.tests.forEach((t, j) => { cells[`${t.t.id}:${row.student.id}`] = String(30 + ((i * 7 + j * 5) % 20)); }));
    await saveResults(db, actor, ex.id, cells);
  }
  const rep = await saveReport(db, actor, year.id, { title: 'Autumn term report', termStart: year.startsOn, termEnd: '2026-12-18', includeExams: true, includePositions: false, includeAttendance: true, includeHomework: true, scoring: true, active: true, teachersCanDownload: true,
    scoreLabels: ['Needs support', 'Developing', 'Good', 'Very good', 'Excellent'], questions: ['Behaviour', 'Progress', 'Effort'] });
  if (rep.ok) await saveEntries(db, actor, rep.id, kidsA.slice(0, 3).map((k, i) => ({ studentId: k.id, scores: [5 - i, 4, 3 + (i % 2)], comment: 'A settled and hard-working start to the year.' })));
  await saveIncidentTemplate(db, actor, { name: 'Minor injury', severity: 'Low', title: 'Minor injury', report: 'Bumped while playing at break.', action: 'Checked by a first aider.', inEoty: '', onPortal: 'on' });
  if (kidsA[0]) await saveIncident(db, actor, { kind: 'student', studentId: String(kidsA[0].id), classId: String(classA.id), severity: 'Low', occurredAt: `${year.startsOn}T17:30`, title: 'Minor injury', report: 'Bumped knee during break time.', action: 'Ice pack given; parent informed at pick-up.', onPortal: 'on' });
  await saveProduct(db, actor, { name: 'Sample notebook', description: 'A5 lined notebook', price: '2.50', meritPrice: '10', stock: '40', active: 'on' }, undefined);
  await saveEvent(db, actor, year.id, { name: 'Sample museum visit', date: '2026-11-20', time: '09:30', hours: '5', optInDeadline: '2026-11-10', paymentDeadline: '2026-11-13', description: 'A day visit to a sample museum.', autoInvoice: 'on', active: 'on',
    consents: [{ text: 'I give permission for my child to attend', required: true }, { text: 'Photos may be taken for the school newsletter', required: false }], prices: [{ description: 'Coach and entry', price: '12', required: true }] });
  await saveCategory(db, actor, { name: 'General', description: 'Questions and news for everyone', classIds: [] });
  const [cat] = await db.select().from(schema.forumCategory);
  await post(db, { kind: 'admin', id: admin!.id, name: admin!.name }, { categoryId: cat!.id, title: 'Welcome to the forums' }, 'Salaam, this is the place for questions about classes and events.');
}
// Portals (Phase 8): a sample parent with two children and a sample teacher, who sign in with the seed password.
async function portalLogin(portal: 'parent' | 'teacher', email: string, link: { contactId?: number; teacherId?: number }) {
  const [idn] = await db.select().from(loginIdentity).where(and(eq(loginIdentity.portal, portal), eq(loginIdentity.email, email)));
  const values = { passwordHash: hash, allowLogin: true, failedAttempts: 0, lockedUntil: null, emailVerifiedAt: new Date(), mustChangePassword: false };
  if (idn) await db.update(loginIdentity).set(values).where(eq(loginIdentity.id, idn.id));
  else await db.insert(loginIdentity).values({ portal, email, ...link, ...values });
}
const [parent1] = await db.select().from(schema.contact).where(eq(schema.contact.email, 'parent001@example.org'));
const [teacher1] = await db.select().from(schema.teacher).where(eq(schema.teacher.email, 'teacher1@example.org'));
if (parent1 && teacher1 && year) {
  await portalLogin('parent', 'parent001@example.org', { contactId: parent1.id });
  await portalLogin('teacher', 'teacher1@example.org', { teacherId: teacher1.id });
  const [kid4] = await db.select().from(schema.student).where(eq(schema.student.surname, 'Student 004'));
  if (kid4) await db.insert(schema.studentContact).values({ studentId: kid4.id, contactId: parent1.id, type: 'Parent', relation: 'Mother', isPrimary: false }).onConflictDoNothing();
  const [classA] = await db.select().from(schema.schoolClass).where(and(eq(schema.schoolClass.academicYearId, year.id), eq(schema.schoolClass.name, 'Test Class A')));
  if (classA) await db.update(schema.classTeacher).set({ canEoty: true, canMessage: true, canMerits: true, canIncidents: true }).where(and(eq(schema.classTeacher.classId, classA.id), eq(schema.classTeacher.teacherId, teacher1.id)));
}

await client.end();
console.log('Seeded fictional sample data: admin@example.org (super) and clerk@example.org (can edit), parent001@example.org (parent portal), teacher1@example.org (teacher portal)');
