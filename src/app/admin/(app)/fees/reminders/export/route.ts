import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { contact, invoice, studentContact } from '@/db/schema';
import { penceToInput } from '@/lib/money';
import { audit } from '@/server/audit';
import { getAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { csvResponse, toCsv } from '@/server/people/csv';
import { invoiceRows } from '@/server/fees/invoices';

/** The prepared reminder list as CSV: one row per student with their chosen invoices' balance and primary contact. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin || !adminCan(admin.staff, 'fees')) return new Response('Not found', { status: 404 });
  const ids = new URL(req.url).searchParams.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10_000);
  const rows = (ids.length ? await invoiceRows(db, inArray(invoice.id, ids)) : []).filter((r) => r.balance > 0);
  const sids = [...new Set(rows.map((r) => r.studentId))];
  const contacts = sids.length ? await db.select({ s: studentContact.studentId, name: contact.name, email: contact.email, mobile: contact.mobile }).from(studentContact)
    .innerJoin(contact, eq(contact.id, studentContact.contactId)).where(and(inArray(studentContact.studentId, sids), eq(studentContact.isPrimary, true))) : [];
  await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Downloaded a reminder list of ${sids.length} students`, page: 'Reminders', entity: 'invoice' });
  return csvResponse('fees-outstanding.csv', toCsv(['student_id', 'student_name', 'invoices', 'balance', 'overdue_balance', 'contact', 'email', 'mobile'], sids.map((sid) => {
    const mine = rows.filter((r) => r.studentId === sid);
    const c = contacts.find((x) => x.s === sid);
    return [sid, mine[0]!.studentName, mine.map((r) => `#${r.id}`).join(' '), penceToInput(mine.reduce((s, r) => s + r.balance, 0)),
      penceToInput(mine.filter((r) => r.status === 'Overdue').reduce((s, r) => s + r.balance, 0)), c?.name ?? '', c?.email ?? '', c?.mobile ?? ''];
  })));
}
