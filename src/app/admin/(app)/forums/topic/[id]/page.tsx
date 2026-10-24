import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { forumTopic } from '@/db/schema';
import { TextArea } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { postsIn } from '@/server/learning/forums';
import { lockTopicAction, removePostAction, replyAction } from '../../actions';

export const metadata = { title: 'Forum topic' };
const ROLE: Record<string, string> = { admin: 'Admin', teacher: 'Teacher', contact: 'Parent' };

/** A topic's posts, with moderation: remove a post (kept for the record) or lock the topic. */
export default async function Topic({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const [t] = Number.isInteger(id) ? await db.select().from(forumTopic).where(eq(forumTopic.id, id)) : [];
  if (!t) notFound();
  const posts = await postsIn(db, id);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{t.title}</h1><p>Started by {t.authorName}{t.locked ? ' · locked: only admins can reply' : ''}</p></div>
        <div className="ra-toolbar">{canEdit && <ActionButton action={lockTopicAction.bind(null, id, !t.locked)} label={t.locked ? 'Unlock topic' : 'Lock topic'} />}<Link className="ra-btn" href={`/admin/forums/${t.categoryId}`}>Back to category</Link></div></div>
      <section className="ra-card ra-thread" aria-label="Posts">
        {posts.map((p) => (
          <article key={p.id} aria-label={`Post by ${p.authorName}`}>
            <div className="ra-note" style={{ marginBottom: 4 }}><b>{p.authorName}</b> · {ROLE[p.authorKind]} · {formatInstant(p.createdAt, 'dd/MM/yyyy HH:mm')}</div>
            {p.deletedAt ? <p className="ra-muted" style={{ margin: 0 }}>Removed by {p.deletedBy}.</p> : <div className="ra-bubble" style={{ whiteSpace: 'pre-wrap' }}>{p.body}</div>}
            {canEdit && !p.deletedAt && <ActionButton action={removePostAction.bind(null, p.id)} label="Remove post" danger confirm="Remove this post? It stays in the record but is hidden." />}
          </article>
        ))}
      </section>
      {canEdit && <Form action={replyAction.bind(null, id)} submit="Post reply" resetOnSuccess><TextArea name="body" label="Reply" rows={4} /></Form>}
    </div>
  );
}
