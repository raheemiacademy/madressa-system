import Link from 'next/link';
import { db } from '@/db';
import { formatCalendarDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { duplicateStudents } from '@/server/people/students';

export const metadata = { title: 'Find duplicate students' };

export default async function Duplicates() {
  await requireAdmin();
  const rows = await duplicateStudents(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Find duplicate students</h1><p>Records with the same name and date of birth. Open each one, keep the right record and delete the other.</p></div></div>
      <section className="ra-card">
        <div className="ra-note">{rows.length ? plural(rows.length, 'possible duplicate') : ''}</div>
        {rows.length === 0 ? <p className="ra-empty">No duplicates found.</p> : (
          <table className="ra-table"><thead><tr><th>Name</th><th>Date of birth</th><th>Records</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.ids.join('-')}><td className="wrap">{r.name}</td><td>{r.dob ? formatCalendarDate(r.dob) : 'Not given'}</td>
                <td className="wrap">{r.ids.map((id, i) => <span key={id}>{i ? ', ' : ''}<Link href={`/admin/students/${id}`}>#{id}</Link></span>)}</td></tr>
            ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
