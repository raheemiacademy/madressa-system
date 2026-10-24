import { cookies } from 'next/headers';
import { db } from '@/db';
import { INVOICE_TYPES } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { penceToInput } from '@/lib/money';
import { resolveYear } from '@/server/academic-years';
import { audit } from '@/server/audit';
import { getAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { csvResponse, toCsv } from '@/server/people/csv';
import { annual } from '@/server/fees/reports';

const money = (p: number) => penceToInput(p);

/** §2 Annual report CSV, by invoices, students or contacts. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.staff, 'fees')) return new Response('Not found', { status: 404 });
  const sp = new URL(req.url).searchParams;
  const type = (INVOICE_TYPES as readonly string[]).includes(sp.get('type') ?? '') ? sp.get('type') as (typeof INVOICE_TYPES)[number] : undefined;
  const by = sp.get('by') === 'students' ? 'students' : sp.get('by') === 'contacts' ? 'contacts' : 'invoices';
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  if (!year) return new Response('Not found', { status: 404 });
  const r = await annual(db, year.id, type);
  await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Exported the ${year.title} annual fees report by ${by}`, page: 'Annual report', entity: 'invoice' });
  const file = `fees-${year.title.replace(/\W+/g, '-')}-${by}.csv`;
  if (by === 'invoices') return csvResponse(file, toCsv(['inv_id', 'student_id', 'student_name', 'type', 'period_or_description', 'due_date', 'amount', 'received', 'balance', 'status'],
    r.invoices.map((i) => [i.id, i.studentId, i.studentName, i.type, i.periodFrom ? `${formatCalendarDate(i.periodFrom)} to ${i.periodTo ? formatCalendarDate(i.periodTo) : ''}` : i.description ?? '', formatCalendarDate(i.dueDate), money(i.amountPence), money(i.received), money(i.balance), i.status])));
  const rows = by === 'students' ? r.students : r.contacts;
  return csvResponse(file, toCsv([by === 'students' ? 'student_id' : 'contact_id', 'name', 'invoices', 'total', 'received', 'balance'], rows.map((x) => [x.id || '', x.name, x.count, money(x.total), money(x.received), money(x.balance)])));
}
