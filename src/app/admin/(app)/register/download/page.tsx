import { db } from '@/db';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { monthGrid } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';
import { getProfile } from '@/server/profile';
import { yearAndClasses } from '../../students/year-classes';

export const metadata = { title: 'Download register' };
const ORDERS = { firstName: 'First name', surname: 'Surname', dob: 'Date of birth' } as const;

/** Blank register by month, and daily or monthly registers by class: print layouts (Save as PDF). */
export default async function Download({ searchParams }: { searchParams: Promise<{ class?: string; month?: string; kind?: string; order?: string; date?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { options } = await yearAndClasses();
  const classId = Number(sp.class) || null;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : todayIso().slice(0, 7);
  const kind = sp.kind === 'monthly' || sp.kind === 'daily' ? sp.kind : 'blank';
  const order = (sp.order && sp.order in ORDERS ? sp.order : 'surname') as keyof typeof ORDERS;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : todayIso();
  const [school, g] = await Promise.all([getProfile(db), classId ? monthGrid(db, classId, kind === 'daily' ? date.slice(0, 7) : month) : null]);
  const rows = g ? [...g.rows].sort((a, b) => order === 'firstName' ? a.firstName.localeCompare(b.firstName) : a.surname.localeCompare(b.surname) || a.firstName.localeCompare(b.firstName)) : [];
  const days = !g ? [] : kind === 'daily' ? g.days.filter((d) => d.date === date) : g.days;
  const className = options.find((o) => o.value === String(classId))?.label;
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>Download register</h1><p>Choose a register, then print it or save it as a PDF.</p></div></div>
      <form className="ra-card ra-fields no-print" action="/admin/register/download" style={{ alignItems: 'end' }}>
        <div className="ra-field"><label htmlFor="dl-k">Register</label><select className="ra-select" id="dl-k" name="kind" defaultValue={kind}><option value="blank">Blank register (month)</option><option value="monthly">Monthly register</option><option value="daily">Daily register</option></select></div>
        <div className="ra-field"><label htmlFor="dl-c">Class</label><select className="ra-select" id="dl-c" name="class" defaultValue={classId ?? ''}><option value="">Choose a class</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="dl-m">Month</label><input className="ra-input" id="dl-m" type="month" name="month" defaultValue={month} /></div>
        <div className="ra-field"><label htmlFor="dl-d">Date (daily)</label><input className="ra-input" id="dl-d" type="date" name="date" defaultValue={date} /></div>
        <div className="ra-field"><label htmlFor="dl-o">Order by</label><select className="ra-select" id="dl-o" name="order" defaultValue={order}>{Object.entries(ORDERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="ra-toolbar"><button className="ra-btn">Show</button>{g && <PrintButton label="Print or save as PDF" />}</div>
      </form>
      {g && (
        <section className="ra-card">
          <div className="ra-card-h"><div><h2>{className} · {kind === 'daily' ? formatCalendarDate(date, 'EEEE d MMMM yyyy') : new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><div className="ra-note">{school?.name} · {kind === 'blank' ? 'Blank register' : kind === 'daily' ? 'Daily register' : 'Monthly register'}</div></div></div>
          {days.length === 0 ? <p className="ra-empty">No register days for this choice.</p> : (
            <table className="ra-table ra-reg">
              <thead><tr><th>Student</th>{days.map((d) => <th key={d.date} className="m">{new Date(`${d.date}T12:00:00Z`).getUTCDate()}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}><td className="wrap">{r.firstName} {r.surname}</td>
                  {days.map((d) => <td key={d.date} className="m" style={{ border: kind === 'blank' ? '1px solid var(--color-border-line)' : undefined }}>{kind === 'blank' ? '' : (r.cells[d.date] ?? []).map((c) => c.letter).join(' ') || (d.closed?.kind ?? '')}</td>)}</tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
