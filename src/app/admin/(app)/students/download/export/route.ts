import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { GENDERS, STUDENT_STATUSES } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { audit } from '@/server/audit';
import { decrypt } from '@/server/crypto';
import { getAdmin } from '@/server/next/actor';
import { csvResponse, toCsv } from '@/server/people/csv';
import { ageOn, todayIso } from '@/server/people/common';

/** Download Students CSV. Filters are whitelisted; values go in as bound parameters. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response('Not found', { status: 404 });
  const p = new URL(req.url).searchParams;
  const on = (k: string) => p.get(k) === '1';
  const status = STUDENT_STATUSES.find((s) => s === p.get('status'));
  const gender = GENDERS.find((g) => g === p.get('gender'));
  const classId = Number(p.get('class')) || null;
  const groupId = Number(p.get('group')) || null;
  const order = ({ name: 'first_name, surname', age: 'dob desc nulls last', class: 'classes nulls last, surname', start: 'start_date nulls last, surname' } as Record<string, string>)[p.get('order') ?? ''] ?? 'surname, first_name';

  const rows = await db.execute<Record<string, string | null | boolean>>(sql`
    select s.id, s.first_name, s.surname, s.dob::text, s.gender, s.status, s.start_date::text, s.left_date::text, s.address, s.postcode, s.medical_notes_enc, s.has_medical,
      (select string_agg(c.name, ', ' order by c.name) from class_assignment a join school_class c on c.id = a.class_id where a.student_id = s.id and a.to_date is null) as classes,
      (select string_agg(t.name, ', ') from class_assignment a join school_class c on c.id = a.class_id join teacher t on t.id = c.main_teacher_id where a.student_id = s.id and a.to_date is null) as teachers,
      (select string_agg(ct.name || coalesce(' (' || sc.relation || ')', '') || coalesce(' ' || ct.mobile, '') || coalesce(' ' || ct.email, ''), '; ' order by sc.is_primary desc, sc.sort_order)
        from student_contact sc join contact ct on ct.id = sc.contact_id where sc.student_id = s.id and (${!on('primaryOnly')} or sc.is_primary)) as contacts
    from student s
    where (${status ?? null}::student_status is null or s.status = ${status ?? null}::student_status)
      and (${gender ?? null}::gender is null or s.gender = ${gender ?? null}::gender)
      and (${classId}::int is null or exists (select 1 from class_assignment a where a.student_id = s.id and a.to_date is null and a.class_id = ${classId}::int))
      and (${groupId}::int is null or exists (select 1 from student_application_group g where g.student_id = s.id and g.group_id = ${groupId}::int))
      and (${!on('medicalOnly')} or s.has_medical)
    order by ${sql.raw(order)}`);

  const today = todayIso();
  const headers = ['ID', 'First name', 'Surname', 'Date of birth', 'Age', 'Gender', 'Status', 'Class', 'Start date', 'Left date'];
  if (on('teacher')) headers.push('Main teacher');
  if (on('address')) headers.push('Address', 'Postcode');
  if (on('contacts') || on('primaryOnly')) headers.push(on('primaryOnly') ? 'Primary contact' : 'Contacts');
  if (on('medical')) headers.push('Medical notes');
  const data = rows.map((r) => {
    const row: unknown[] = [r.id, r.first_name, r.surname, r.dob ? formatCalendarDate(String(r.dob)) : '', ageOn(r.dob as string | null, today) ?? '', r.gender, r.status, r.classes ?? '',
      r.start_date ? formatCalendarDate(String(r.start_date)) : '', r.left_date ? formatCalendarDate(String(r.left_date)) : ''];
    if (on('teacher')) row.push(r.teachers ?? '');
    if (on('address')) row.push(r.address ?? '', r.postcode ?? '');
    if (on('contacts') || on('primaryOnly')) row.push(r.contacts ?? '');
    if (on('medical')) row.push(r.medical_notes_enc ? decrypt(String(r.medical_notes_enc)) : '');
    return row;
  });
  await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Downloaded ${data.length === 1 ? '1 student' : `${data.length} students`} as CSV${on('medical') ? ' (with medical notes)' : ''}`, page: 'Download students', entity: 'student' });
  return csvResponse(`students-${today}.csv`, toCsv(headers, data));
}
