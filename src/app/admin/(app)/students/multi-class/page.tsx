import Link from 'next/link';
import { db } from '@/db';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { multiClassStudents } from '@/server/people/students';

export const metadata = { title: 'Multiple class students' };

export default async function MultiClass() {
  await requireAdmin();
  const rows = await multiClassStudents(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Multiple class students</h1><p>Students who are in more than one class right now.</p></div></div>
      <section className="ra-card">
        <div className="ra-note">{rows.length ? plural(rows.length, 'student') : ''}</div>
        {rows.length === 0 ? <p className="ra-empty">Every student is in one class at most.</p> : (
          <table className="ra-table"><thead><tr><th>Student</th><th>Classes</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="wrap"><Link href={`/admin/students/${r.id}`}>{r.firstName} {r.surname}</Link></td><td className="wrap">{r.classes}</td>
                <td><Link className="ra-link" href={`/admin/students/${r.id}/history`}>Class history</Link></td></tr>
            ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
