import Link from 'next/link';
import { db } from '@/db';
import { INCIDENT_SEVERITIES } from '@/db/schema';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { listIncidents, twelveMonths } from '@/server/learning/incidents';
import { todayIso } from '@/server/people/common';

export const metadata = { title: 'Health & safety reports' };
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

/** §9 Health & Safety: the 12-month record, and incidents in a date range as a PDF (Download PDF) or CSV. */
export default async function HealthSafety({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIso();
  const from = date(sp.from), to = date(sp.to);
  const [months, rows] = await Promise.all([twelveMonths(db, today), from || to ? listIncidents(db, { from, to }, 5000) : Promise.resolve([])]);
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>Health &amp; safety reports</h1><p>Incidents over the last 12 months, and a full list for any dates</p></div><div className="ra-toolbar"><Link className="ra-btn" href="/admin/incidents">Incidents</Link></div></div>
      <section className="ra-card" aria-labelledby="m12-h">
        <div className="ra-card-h"><div><h2 id="m12-h">12-month record</h2></div></div>
        <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
          <thead><tr><th>Month</th>{INCIDENT_SEVERITIES.map((s) => <th key={s} className="num">{s}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>{months.map((m) => <tr key={m.month}><td>{formatCalendarDate(`${m.month}-01`, 'MMMM yyyy')}</td>{INCIDENT_SEVERITIES.map((s) => <td key={s} className="num">{(m as unknown as Record<string, number>)[s] || ''}</td>)}<td className="num">{m.total}</td></tr>)}</tbody>
        </table></div>
      </section>
      <form className="ra-card ra-toolbar no-print" role="search">
        <div className="ra-field"><label htmlFor="hs-from">From</label><input className="ra-input" id="hs-from" type="date" name="from" defaultValue={from ?? ''} /></div>
        <div className="ra-field"><label htmlFor="hs-to">To</label><input className="ra-input" id="hs-to" type="date" name="to" defaultValue={to ?? ''} /></div>
        <button className="ra-btn">Show incidents</button>
        {(from || to) && <><PrintButton /><a className="ra-btn" href={`/admin/incidents/reports/export?${new URLSearchParams(Object.entries({ from, to }).filter(([, x]) => x) as [string, string][])}`}>Download CSV</a></>}
      </form>
      {(from || to) && (
        <section className="ra-card" aria-label="Incidents in range">
          {rows.length === 0 ? <p className="ra-empty">No incidents in these dates.</p> : (
            <table className="ra-table"><thead><tr><th>When</th><th>Who</th><th>Severity</th><th>Title</th><th>Report</th><th>Action</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.i.id}><td>{formatInstant(r.i.occurredAt, 'dd/MM/yyyy HH:mm')}</td><td className="wrap">{r.who}</td><td>{r.i.severity}</td><td className="wrap">{r.i.title}</td><td className="wrap">{r.i.report}</td><td className="wrap">{r.i.action ?? ''}</td></tr>)}</tbody></table>
          )}
        </section>
      )}
    </div>
  );
}
