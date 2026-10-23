// Fictional seed data for local development and e2e tests. Never put real people here.
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/server/auth';

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
await client.end();
console.log('Seeded fictional sample data: admin@example.org (super) and clerk@example.org (can edit)');
