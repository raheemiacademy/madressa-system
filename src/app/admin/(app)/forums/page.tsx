import Link from 'next/link';
import { db } from '@/db';
import { Checks, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listCategories } from '@/server/learning/forums';
import { yearAndClasses } from '../students/year-classes';
import { saveCategoryAction } from './actions';

export const metadata = { title: 'Forums' };

/** §14 Forum categories and which classes can see them. Teachers and parents post from their portals (Phase 8). */
export default async function Forums() {
  const admin = await requireAdmin();
  const [{ options }, rows] = await Promise.all([yearAndClasses(), listCategories(db)]);
  const name = (ids: number[]) => ids.length ? ids.map((i) => options.find((o) => Number(o.value) === i)?.label ?? `#${i}`).join(', ') : 'Everyone';
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Forums</h1><p>Discussion categories for teachers and families, visible to the classes you choose</p></div></div>
      <section className="ra-card" aria-label="Categories">
        {rows.length === 0 ? <p className="ra-empty">No categories yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th className="num">Order</th><th>Category</th><th>Description</th><th>Classes</th><th className="num">Topics</th><th className="num">Posts</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.c.id}><td className="num">{r.c.sortOrder}</td><td className="wrap"><Link href={`/admin/forums/${r.c.id}`}>{r.c.name}</Link></td><td className="wrap">{r.c.description ?? ''}</td>
                <td className="wrap">{name(r.c.classIds)}</td><td className="num">{r.topics}</td><td className="num">{r.posts}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {canEdit && (
        <Form action={saveCategoryAction.bind(null, null)} submit="Add category" resetOnSuccess>
          <div className="ra-card-h"><div><h2>New category</h2></div></div>
          <div className="ra-fields"><TextField name="name" label="Name" /><TextField name="sortOrder" label="Order" inputMode="numeric" defaultValue="0" /><TextField name="description" label="Description" full /></div>
          <Checks name="classIds" legend="Classes that can see it (none = everyone; several = combined)" options={options} />
        </Form>
      )}
    </div>
  );
}
