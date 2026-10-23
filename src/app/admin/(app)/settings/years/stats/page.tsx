import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { PrintButton } from '@/components/PrintButton';
import { requireAdmin } from '@/server/next/actor';

export const metadata = { title: 'Yearly comparison stats' };

/** Students who were in any class during each year, by gender, and classes per year. */
export default async function Stats() {
  await requireAdmin('super');
  const rows = await db.execute<{ title: string; boys: number; girls: number; unspecified: number; total: number; classes: number }>(sql`
    select y.title,
      count(distinct s.id) filter (where s.gender = 'Male')::int as boys,
      count(distinct s.id) filter (where s.gender = 'Female')::int as girls,
      count(distinct s.id) filter (where s.gender = 'Unspecified')::int as unspecified,
      count(distinct s.id)::int as total,
      (select count(*)::int from school_class c2 where c2.academic_year_id = y.id) as classes
    from academic_year y
    left join school_class c on c.academic_year_id = y.id
    left join class_assignment a on a.class_id = c.id
    left join student s on s.id = a.student_id
    group by y.id, y.title, y.starts_on order by y.starts_on desc`);
  return (
    <section className="ra-card" aria-labelledby="ys-h">
      <div className="ra-card-h"><div><h2 id="ys-h">Yearly comparison stats</h2><div className="ra-note">Students counted once per year if they were in any class that year.</div></div><div className="no-print"><PrintButton /></div></div>
      {rows.length === 0 ? <p className="ra-empty">No years yet.</p> : (
        <table className="ra-table"><thead><tr><th>Year</th><th className="num">Boys</th><th className="num">Girls</th><th className="num">Unspecified</th><th className="num">Total</th><th className="num">Classes</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.title}><td>{r.title}</td><td className="num">{r.boys}</td><td className="num">{r.girls}</td><td className="num">{r.unspecified}</td><td className="num">{r.total}</td><td className="num">{r.classes}</td></tr>)}</tbody></table>
      )}
    </section>
  );
}
