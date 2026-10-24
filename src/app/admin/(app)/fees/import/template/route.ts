import { and, eq, gte, lte } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { invoice } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { penceToInput } from '@/lib/money';
import { resolveYear } from '@/server/academic-years';
import { audit } from '@/server/audit';
import { getAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { csvResponse, toCsv } from '@/server/people/csv';
import { FEE_COLUMNS } from '@/server/fees/imports';
import { invoiceRows } from '@/server/fees/invoices';

const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** §2 Import Fees template: blank (all new), or this year's invoices (all or unpaid only) in a due-date range. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.staff, 'fees')) return new Response('Not found', { status: 404 });
  const sp = new URL(req.url).searchParams;
  const mode = sp.get('mode') === 'unpaid' ? 'unpaid' : sp.get('mode') === 'all' ? 'all' : 'new';
  const cols = FEE_COLUMNS.map((c) => c.name);
  if (mode === 'new') return csvResponse('fees-template.csv', toCsv(cols, []));
  const d = (v: string | null) => (v ? (sp.get('format') === 'iso' ? v : formatCalendarDate(v)) : '');
  const { year } = await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null);
  if (!year) return csvResponse('fees-template.csv', toCsv(cols, []));
  const from = iso(sp.get('from')), to = iso(sp.get('to'));
  const rows = (await invoiceRows(db, and(eq(invoice.academicYearId, year.id), from ? gte(invoice.dueDate, from) : undefined, to ? lte(invoice.dueDate, to) : undefined)))
    .filter((r) => mode === 'all' || r.balance > 0);
  await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Downloaded ${rows.length} invoices as a fees import template`, page: 'Import fees', entity: 'invoice' });
  return csvResponse(`fees-${mode}.csv`, toCsv(cols, rows.map((r) => [r.id, r.studentId, r.studentName, r.type, d(r.invoiceDate), d(r.dueDate), d(r.periodFrom), d(r.periodTo), penceToInput(r.amountPence), r.description ?? '', '', '', '', '', ''])));
}
