import { db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { getAdmin } from '@/server/next/actor';
import { csvResponse, toCsv } from '@/server/people/csv';
import { consentsForClass } from '@/server/people/extras';

export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  const classId = Number(new URL(req.url).searchParams.get('class'));
  if (!Number.isInteger(classId) || classId <= 0) return new Response('Choose a class', { status: 400 });
  const rows = await consentsForClass(db, classId);
  return csvResponse(`walk-home-consents-${classId}.csv`, toCsv(['Student ID', 'First name', 'Surname', 'Consent', 'Date', 'Source'],
    rows.map((r) => [r.id, r.firstName, r.surname, r.givenAt ? 'Yes' : 'No', r.givenAt ? formatInstant(r.givenAt, 'dd/MM/yyyy') : '', r.source ?? ''])));
}
