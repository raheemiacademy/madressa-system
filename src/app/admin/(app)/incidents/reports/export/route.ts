import { db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { audit } from '@/server/audit';
import { getAdmin } from '@/server/next/actor';
import { csvResponse, toCsv } from '@/server/people/csv';
import { listIncidents } from '@/server/learning/incidents';

const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** §9 incidents in a date range as CSV (audited: incident reports hold personal data). */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response('Not found', { status: 404 });
  const sp = new URL(req.url).searchParams;
  const rows = await listIncidents(db, { from: date(sp.get('from')), to: date(sp.get('to')) }, 10_000);
  await audit(db, { identityId: admin.identityId, name: admin.name }, { action: `Exported ${rows.length} incidents as CSV`, page: 'Health & safety', entity: 'incident' });
  return csvResponse('incidents.csv', toCsv(['date', 'time', 'who', 'type', 'class', 'severity', 'title', 'report', 'action', 'in_report', 'on_portal'],
    rows.map((r) => [formatInstant(r.i.occurredAt, 'dd/MM/yyyy'), formatInstant(r.i.occurredAt, 'HH:mm'), r.who, r.i.kind, r.className ?? '', r.i.severity, r.i.title, r.i.report, r.i.action ?? '', r.i.inEoty ? 'yes' : 'no', r.i.onPortal ? 'yes' : 'no'])));
}
