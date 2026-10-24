import { asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { contact, student } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { audit } from '@/server/audit';
import { decrypt } from '@/server/crypto';
import { getAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { csvResponse, toCsv } from '@/server/people/csv';
import { COLUMNS, type ImportKind } from '@/server/people/imports';

const d = (v: string | null) => (v ? formatCalendarDate(v) : '');

/** Blank template, or (?existing=1) every existing record with its ID for Export/Import Edit. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.staff, 'edit')) return new Response('Not found', { status: 404 });
  const kind = (await params).kind as ImportKind;
  if (!(kind in COLUMNS)) return new Response('Not found', { status: 404 });
  const existing = new URL(req.url).searchParams.get('existing') === '1';
  if (!existing) return csvResponse(`${kind}-template.csv`, toCsv(COLUMNS[kind].map((c) => c.name), []));

  if (kind === 'students') {
    const cols = COLUMNS.students.filter((c) => !c.name.startsWith('contact_')).map((c) => c.name);
    const rows = await db.select({ s: student, classes: sql<string | null>`(select string_agg(c.name, ', ') from class_assignment a join school_class c on c.id = a.class_id where a.student_id = "student"."id" and a.to_date is null)` })
      .from(student).orderBy(asc(student.surname));
    await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Exported ${rows.length} students for editing`, page: 'Export/import edit', entity: 'student' });
    return csvResponse('students-edit.csv', toCsv(cols, rows.map(({ s, classes }) => [s.id, s.firstName, s.surname, d(s.dob), s.gender, s.status, (classes ?? '').split(', ')[0] ?? '', d(s.startDate), d(s.leftDate),
      s.email, s.tel, s.mobile, s.mobile2, s.address, s.postcode, s.medicalNotesEnc ? decrypt(s.medicalNotesEnc) : '', s.notes])));
  }
  if (kind === 'contacts') {
    const rows = await db.select().from(contact).orderBy(asc(contact.name));
    await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Exported ${rows.length} contacts for editing`, page: 'Export/import edit', entity: 'contact' });
    return csvResponse('contacts-edit.csv', toCsv(['id', 'name', 'email', 'tel', 'mobile', 'alt_mobile', 'address', 'postcode', 'gender'],
      rows.map((c) => [c.id, c.name, c.email, c.tel, c.mobile, c.altMobile, c.address, c.postcode, c.gender])));
  }
  return new Response('Not found', { status: 404 });
}
