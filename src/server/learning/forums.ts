import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { forumCategory, forumPost, forumTopic } from '@/db/schema';
import { optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from '../people/common';

export const categoryInput = z.object({
  name: z.string().trim().min(1, 'Name the category').max(80), description: optionalText(300),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([])
});

/** §14 categories with topic and post counts. Empty classIds = every class can see it. */
export const listCategories = (db: DbOrTx) => db.select({
  c: forumCategory,
  topics: sql<number>`(select count(*) from forum_topic t where t.category_id = "forum_category"."id")`.mapWith(Number),
  posts: sql<number>`(select count(*) from forum_post p join forum_topic t on t.id = p.topic_id where t.category_id = "forum_category"."id" and p.deleted_at is null)`.mapWith(Number)
}).from(forumCategory).orderBy(asc(forumCategory.sortOrder), asc(forumCategory.name));

export async function saveCategory(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = categoryInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(forumCategory).set(p.data).where(eq(forumCategory.id, id)).returning() : await db.insert(forumCategory).values(p.data).returning();
  await audit(db, actor, { action: `Saved forum category “${p.data.name}”`, page: 'Forums', entity: 'forum_category', entityId: row?.id });
  return { ok: true as const };
}

export async function deleteCategory(db: Db, actor: Actor, id: number) {
  const [c] = await db.delete(forumCategory).where(eq(forumCategory.id, id)).returning();
  if (c) await audit(db, actor, { action: `Deleted forum category “${c.name}” and its topics`, page: 'Forums', entity: 'forum_category', entityId: id });
}

export const topicsIn = (db: DbOrTx, categoryId: number) => db.select({ t: forumTopic, posts: sql<number>`(select count(*) from forum_post p where p.topic_id = "forum_topic"."id" and p.deleted_at is null)`.mapWith(Number) })
  .from(forumTopic).where(eq(forumTopic.categoryId, categoryId)).orderBy(desc(forumTopic.lastPostAt));

export const postsIn = (db: DbOrTx, topicId: number) => db.select().from(forumPost).where(eq(forumPost.topicId, topicId)).orderBy(asc(forumPost.id));

/** Admins (and later teachers and parents, from the portals) start topics and reply. Locked topics take no replies except from admins. */
export async function post(db: Db, author: { kind: 'admin' | 'teacher' | 'contact'; id: number; name: string }, where: { categoryId: number; title: string } | { topicId: number }, body: string) {
  const text = body.trim().slice(0, 10_000);
  if (!text) return { ok: false as const, error: 'Write something first' };
  return db.transaction(async (tx) => {
    let topicId: number;
    if ('topicId' in where) {
      const [t] = await tx.select().from(forumTopic).where(eq(forumTopic.id, where.topicId));
      if (!t) return { ok: false as const, error: 'This topic no longer exists' };
      if (t.locked && author.kind !== 'admin') return { ok: false as const, error: 'This topic is locked' };
      topicId = t.id;
    } else {
      const title = where.title.trim().slice(0, 200);
      if (!title) return { ok: false as const, error: 'Give the topic a title' };
      topicId = (await tx.insert(forumTopic).values({ categoryId: where.categoryId, title, authorKind: author.kind, authorId: author.id, authorName: author.name }).returning({ id: forumTopic.id }))[0]!.id;
    }
    await tx.insert(forumPost).values({ topicId, authorKind: author.kind, authorId: author.id, authorName: author.name, body: text });
    await tx.update(forumTopic).set({ lastPostAt: new Date() }).where(eq(forumTopic.id, topicId));
    return { ok: true as const, topicId };
  });
}

/** Moderation: hide a post (kept for the record, shown as removed), lock or unlock a topic. */
export async function removePost(db: Db, actor: Actor, postId: number) {
  const [p] = await db.update(forumPost).set({ deletedAt: new Date(), deletedBy: actor.name }).where(and(eq(forumPost.id, postId), isNull(forumPost.deletedAt))).returning();
  if (p) await audit(db, actor, { action: `Removed a forum post by ${p.authorName}`, page: 'Forums', entity: 'forum_post', entityId: postId });
}
export async function lockTopic(db: Db, actor: Actor, topicId: number, locked: boolean) {
  const [t] = await db.update(forumTopic).set({ locked }).where(eq(forumTopic.id, topicId)).returning();
  if (t) await audit(db, actor, { action: `${locked ? 'Locked' : 'Unlocked'} forum topic “${t.title}”`, page: 'Forums', entity: 'forum_topic', entityId: topicId });
}
