import { db } from '@/db';
import { quality } from '@/lib/attendance';
import { getAdmin } from '@/server/next/actor';
import { attendanceStats } from '@/server/attendance/reports';
import { csvResponse, toCsv } from '@/server/people/csv';
import { statsParams } from '../params';

export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  const p = statsParams(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await attendanceStats(db, p);
  return csvResponse(`attendance-${p.from}-to-${p.to}.csv`, toCsv(['Student ID', 'Student', 'Class', 'Entries', 'Present', 'Absent', 'Late', 'Percent', 'Percent (strict)', 'Quality'],
    rows.map((r) => [r.studentId, `${r.student!.firstName} ${r.student!.surname}`, r.student!.classes ?? '', r.summary.sessions, r.summary.present, r.summary.absent, r.summary.late, r.summary.standardPct ?? '', r.summary.strictPct ?? '', quality(r.summary.standardPct)])));
}
