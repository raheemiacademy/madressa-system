import Link from 'next/link';
import { db } from '@/db';
import { Icon } from '@/components/Icon';
import { formatPence } from '@/lib/money';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { annualTotal, listStructures, periodsOf, structureByClass } from '@/server/fees/structures';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Fees structure' };

export default async function Structures() {
  await requireAdmin('fees');
  const { year } = await yearAndClasses();
  const [structures, byClass] = year ? await Promise.all([listStructures(db, year.id), structureByClass(db, year.id)]) : [[], new Map()];
  const periods = await periodsOf(db, structures.map((s) => s.id));
  const total = (id: number) => annualTotal(periods.filter((p) => p.structureId === id));
  const classes = [...byClass.entries()];
  return (
    <div className="ra-page">
      <FeesHead title="Fees structure" desc={`One structure per class, plus a default${year ? ` for ${year.title}` : ''}`}>
        <Link className="ra-btn" href="/admin/fees/structure/new"><Icon name="plus" />Add structure</Link>
        <Link className="ra-btn" href="/admin/fees/structure/new?kind=adhoc">Add new ad hoc structure</Link>
        <Link className="ra-btn" href="/admin/fees/generate">Generate invoices</Link>
      </FeesHead>
      {!year ? <p className="ra-empty">Add an academic year first.</p> : (
        <>
          <section className="ra-card" aria-labelledby="st-h">
            <div className="ra-card-h"><div><h2 id="st-h">Structures</h2><div className="ra-note">Changing a structure affects invoices generated from now on. Use Modify invoices to change ones already made.</div></div></div>
            {structures.length === 0 ? <p className="ra-empty">No fees structures for this year yet.</p> : (
              <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
                <thead><tr><th>Structure</th><th>Kind</th><th className="num">Periods</th><th className="num">Annual total</th><th>Classes</th></tr></thead>
                <tbody>{structures.map((s) => (
                  <tr key={s.id}><td className="wrap"><Link href={`/admin/fees/structure/${s.id}`}>{s.name}</Link></td>
                    <td>{s.isDefault ? 'Default' : s.isAdHoc ? 'Ad hoc' : 'Classes'}</td><td className="num">{periods.filter((p) => p.structureId === s.id).length}</td>
                    <td className="num">{formatPence(total(s.id))}</td>
                    <td className="wrap">{s.isAdHoc ? '—' : classes.filter(([, c]) => c.structure?.id === s.id).map(([, c]) => c.className).join(', ') || <span className="ra-muted">None</span>}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          <section className="ra-card" aria-labelledby="pc-h">
            <div className="ra-card-h"><div><h2 id="pc-h">Annual total per class</h2><div className="ra-note">{plural(classes.length, 'class', 'classes')}</div></div></div>
            {classes.length === 0 ? <p className="ra-empty">No classes set up for this year yet.</p> : (
              <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
                <thead><tr><th>Class</th><th>Structure</th><th className="num">Per student per year</th></tr></thead>
                <tbody>{classes.map(([id, c]) => <tr key={id}><td className="wrap">{c.className}</td><td className="wrap">{c.structure ? `${c.structure.name}${c.own ? '' : ' (default)'}` : <span className="ra-warn">None</span>}</td><td className="num">{c.structure ? formatPence(total(c.structure.id)) : '—'}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
