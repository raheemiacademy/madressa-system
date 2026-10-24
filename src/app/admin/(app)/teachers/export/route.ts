import { db } from '@/db';
import { TEACHER_STATUSES } from '@/db/schema';
import { getAdmin } from '@/server/next/actor';
import { csvResponse, toCsv } from '@/server/people/csv';
import { todayIso } from '@/server/people/common';
import { listTeachers } from '@/server/people/teachers';

const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  const status = TEACHER_STATUSES.find((s) => s === new URL(req.url).searchParams.get('status'));
  const rows = await listTeachers(db, status);
  return csvResponse(`teachers-${todayIso()}.csv`, toCsv(['ID', 'Name', 'Email', 'Mobile', 'Gender', 'Status', 'Work days', 'DBS expiry'],
    rows.map((t) => [t.id, t.name, t.email, t.mobile, t.gender, t.status, (t.days ?? []).map((d) => DAY[d]).join(' '), t.dbsExpiresOn ?? ''])));
}
