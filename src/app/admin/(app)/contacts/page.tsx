import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { contact } from '@/db/schema';
import { Icon } from '@/components/Icon';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listContacts, listGroups } from '@/server/people/contacts';
import { readTab } from '@/server/settings';

export const metadata = { title: 'Contacts' };

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; page?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const groupId = Number(sp.group) || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const perPage = Number((await readTab(db, 'preferences')).studentsPerPage) || 50;
  const [{ rows, total }, groups, [all]] = await Promise.all([
    listContacts(db, { q, groupId, page, perPage }), listGroups(db), db.select({ n: sql<number>`count(*)::int` }).from(contact)
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const qs = (o: Record<string, string | number | undefined>) => '?' + new URLSearchParams(Object.entries({ q, group: groupId, ...o }).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Contacts</h1><p>{plural(all?.n ?? 0, 'contact')}: parents, carers and emergency contacts</p></div>
        <div className="ra-toolbar">
          {adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href="/admin/contacts/new"><Icon name="plus" />Add contact</Link>}
          <Link className="ra-btn" href="/admin/import/contacts">Import</Link>
          <Link className="ra-btn" href="/admin/import/contacts?edit=1">Export/import update</Link>
          <Link className="ra-btn" href="/admin/contacts/tools">Contact tools</Link>
        </div></div>
      <section className="ra-card">
        <form className="ra-toolbar" role="search" action="/admin/contacts">
          <input className="ra-input grow" type="search" name="q" defaultValue={q} placeholder="Name, email or phone" aria-label="Search contacts" style={{ maxWidth: 340 }} />
          {groupId && <input type="hidden" name="group" value={groupId} />}
          <button className="ra-btn">Search</button>
        </form>
        {groups.length > 0 && (
          <nav className="ra-filters" aria-label="Groups">
            <Link className="ra-filter" href={qs({ group: undefined, page: undefined })} aria-current={!groupId ? 'page' : undefined}>All</Link>
            {groups.map((g) => <Link key={g.id} className="ra-filter" href={qs({ group: g.id, page: undefined })} aria-current={groupId === g.id ? 'page' : undefined}>{g.name} <b>{g.n}</b></Link>)}
          </nav>
        )}
        {rows.length === 0 ? <p className="ra-empty">{q || groupId ? 'Nothing matches these filters.' : 'No contacts yet.'}</p> : (
          <div className="ra-table-wrap" style={{ maxHeight: 640 }}><table className="ra-table">
            <thead><tr><th>#</th><th>Name</th><th className="opt">Telephone</th><th>Mobiles</th><th className="opt">Email</th><th className="num">Students</th></tr></thead>
            <tbody>{rows.map(({ c, students }) => (
              <tr key={c.id}>
                <td className="ra-muted">{c.id}</td>
                <td className="wrap"><Link href={`/admin/contacts/${c.id}`}>{c.name}</Link>{!c.active && <span className="ra-muted"> (inactive)</span>}</td>
                <td className="opt">{c.tel ?? ''}</td>
                <td className="wrap">{[c.mobile, c.altMobile].filter(Boolean).join(', ')}</td>
                <td className="opt wrap">{c.email ?? ''}</td>
                <td className="num">{students}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pages > 1 && (
          <nav className="ra-pager" aria-label="Pages">
            {page > 1 ? <Link className="ra-btn" href={qs({ page: page - 1 })}>Previous</Link> : <span />}<span>Page {page} of {pages}</span>
            {page < pages ? <Link className="ra-btn" href={qs({ page: page + 1 })}>Next</Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
