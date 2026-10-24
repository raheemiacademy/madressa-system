import Link from 'next/link';
import { TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import type { FormState } from '@/lib/validate';
import type { visibleCategories, visibleCategory } from '@/server/portal/shared';
import type { forumPost, forumTopic } from '@/db/schema';

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const ROLE: Record<string, string> = { admin: 'Office', teacher: 'Teacher', contact: 'Parent' };

/** §14 Forum categories this portal user can see. */
export function CategoryList({ cats, base }: { cats: Awaited<ReturnType<typeof visibleCategories>>; base: string }) {
  if (!cats.length) return <p className="rp-empty">No forums yet.</p>;
  return (
    <ul className="rp-list">
      {cats.map(({ c, topics }) => <li key={c.id}><Link href={`${base}/${c.id}`}><span className="t">{c.name}</span><span className="v ra-muted">{topics === 1 ? '1 topic' : `${topics} topics`}</span>{c.description && <span className="m">{c.description}</span>}</Link></li>)}
    </ul>
  );
}

/** A category's topics, newest activity first, and a form to start a topic. */
export function TopicList({ data, base, start }: { data: NonNullable<Awaited<ReturnType<typeof visibleCategory>>>; base: string; start: Action }) {
  return (
    <>
      {!data.topics.length ? <p className="rp-empty">No topics yet. Start one below.</p> : (
        <ul className="rp-list">
          {data.topics.map(({ t, posts }) => <li key={t.id}><Link href={`${base}/topic/${t.id}`}><span className="t">{t.title}{t.locked ? ' (locked)' : ''}</span><span className="v ra-muted">{posts === 1 ? '1 post' : `${posts} posts`}</span><span className="m">Started by {t.authorName} · {formatInstant(t.lastPostAt, 'd MMM, HH:mm')}</span></Link></li>)}
        </ul>
      )}
      <Form action={start} submit="Start topic" savebar={false} resetOnSuccess>
        <h2 style={{ margin: 0 }}>Start a topic</h2>
        <div className="ra-fields"><TextField name="title" label="Title" full autoComplete="off" /><TextArea name="body" label="Message" rows={4} /></div>
      </Form>
    </>
  );
}

/** A topic's posts, with a reply box unless it's locked. Removed posts stay as a note. */
export function TopicView({ topic, posts, reply }: { topic: typeof forumTopic.$inferSelect; posts: (typeof forumPost.$inferSelect)[]; reply: Action }) {
  return (
    <>
      <section className="ra-card ra-thread" aria-label="Posts">
        {posts.map((p) => (
          <article key={p.id} aria-label={`Post by ${p.authorName}`}>
            <div className="ra-note" style={{ marginBottom: 4 }}><b>{p.authorName}</b> · {ROLE[p.authorKind]} · {formatInstant(p.createdAt, 'dd/MM/yyyy HH:mm')}</div>
            {p.deletedAt ? <p className="ra-muted" style={{ margin: 0 }}>Removed by the school.</p> : <div className="ra-bubble" style={{ whiteSpace: 'pre-wrap' }}>{p.body}</div>}
          </article>
        ))}
      </section>
      {topic.locked ? <p className="rp-empty">This topic is locked.</p> : <Form action={reply} submit="Post reply" savebar={false} resetOnSuccess><TextArea name="body" label="Reply" rows={4} /></Form>}
    </>
  );
}
