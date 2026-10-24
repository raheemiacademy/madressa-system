import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { forumCategory } from '@/db/schema';
import { Checks, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { topicsIn } from '@/server/learning/forums';
import { yearAndClasses } from '../../students/year-classes';
import { deleteCategoryAction, newTopicAction, saveCategoryAction } from '../actions';

export const metadata = { title: 'Forum category' };

export default async function Category({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const [c] = Number.isInteger(id) ? await db.select().from(forumCategory).where(eq(forumCategory.id, id)) : [];
  if (!c) notFound();
  const [{ options }, topics] = await Promise.all([yearAndClasses(), topicsIn(db, id)]);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{c.name}</h1><p>{c.description ?? 'Forum category'}</p></div>
        <div className="ra-toolbar">{adminCan(admin.staff, 'delete') && <ActionButton action={deleteCategoryAction.bind(null, id)} label="Delete category" danger confirm={`Delete “${c.name}” and all its topics?`} />}<Link className="ra-btn" href="/admin/forums">Forums</Link></div></div>
      <section className="ra-card" aria-label="Topics">
        {topics.length === 0 ? <p className="ra-empty">No topics yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Topic</th><th>Started by</th><th className="num">Posts</th><th>Last post</th></tr></thead>
            <tbody>{topics.map((t) => <tr key={t.t.id}><td className="wrap"><Link href={`/admin/forums/topic/${t.t.id}`}>{t.t.title}</Link>{t.t.locked ? <span className="ra-muted"> · locked</span> : null}</td><td>{t.t.authorName}</td><td className="num">{t.posts}</td><td>{formatInstant(t.t.lastPostAt, 'dd/MM/yyyy HH:mm')}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
      {canEdit && (
        <div className="ra-grid">
          <div className="ra-c6"><Form action={newTopicAction.bind(null, id)} submit="Start topic"><div className="ra-card-h"><div><h2>New topic</h2></div></div><TextField name="title" label="Title" full /><TextArea name="body" label="First post" rows={4} /></Form></div>
          <div className="ra-c6"><Form action={saveCategoryAction.bind(null, id)} submit="Save category">
            <div className="ra-card-h"><div><h2>Category settings</h2></div></div>
            <div className="ra-fields"><TextField name="name" label="Name" defaultValue={c.name} /><TextField name="sortOrder" label="Order" inputMode="numeric" defaultValue={String(c.sortOrder)} /><TextField name="description" label="Description" full defaultValue={c.description ?? ''} /></div>
            <Checks name="classIds" legend="Classes that can see it (none = everyone)" options={options} checked={c.classIds.map(String)} />
          </Form></div>
        </div>
      )}
    </div>
  );
}
