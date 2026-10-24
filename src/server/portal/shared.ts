import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { classAssignment, forumCategory, forumTopic, homework, homeworkStudent, message, messageParticipant, product, sharedDoc } from '@/db/schema';
import type { Party } from '../comm/messages';

/* Forums, shared documents and file access, for both portals. */

/** §14 Forum categories a portal user can see: those for every class, or for one of their classes. */
export async function visibleCategories(db: DbOrTx, classIds: number[]) {
  const rows = await db.select({ c: forumCategory, topics: sql<number>`(select count(*) from forum_topic t where t.category_id = "forum_category"."id")`.mapWith(Number) })
    .from(forumCategory).orderBy(asc(forumCategory.sortOrder), asc(forumCategory.name));
  return rows.filter((r) => !r.c.classIds.length || r.c.classIds.some((c) => classIds.includes(c)));
}

/** A category this user can see (null otherwise), with its topics. */
export async function visibleCategory(db: DbOrTx, classIds: number[], categoryId: number) {
  const cat = (await visibleCategories(db, classIds)).find((r) => r.c.id === categoryId);
  if (!cat) return null;
  const topics = await db.select({ t: forumTopic, posts: sql<number>`(select count(*) from forum_post p where p.topic_id = "forum_topic"."id" and p.deleted_at is null)`.mapWith(Number) })
    .from(forumTopic).where(eq(forumTopic.categoryId, categoryId)).orderBy(desc(forumTopic.lastPostAt));
  return { category: cat.c, topics };
}

/** A topic in a category this user can see (null otherwise). */
export async function visibleTopic(db: DbOrTx, classIds: number[], topicId: number) {
  const [t] = await db.select().from(forumTopic).where(eq(forumTopic.id, topicId));
  if (!t || !(await visibleCategories(db, classIds)).some((r) => r.c.id === t.categoryId)) return null;
  return t;
}

/** §20 Shared documents for an audience, limited to the user's classes when the document names classes. */
export async function docsFor(db: DbOrTx, audience: 'parents' | 'teachers', classIds: number[]) {
  const docs = await db.select().from(sharedDoc).where(inArray(sharedDoc.audience, [audience, 'both'])).orderBy(desc(sharedDoc.createdAt));
  return docs.filter((d) => !d.classIds.length || d.classIds.some((c) => classIds.includes(c)));
}

/**
 * May this portal user download the file? Only files reached through something they can see: a shared document for them,
 * shop product photos (parents), homework set for their children (parents) or their classes (teachers), a hand-in by those students, or a message on their conversations.
 */
export async function portalCanSee(db: DbOrTx, who: { party: Party; audience: 'parents' | 'teachers'; classIds: number[]; studentIds: number[] }, fileId: string) {
  if ((await docsFor(db, who.audience, who.classIds)).some((d) => d.fileId === fileId)) return true;
  if (who.audience === 'parents' && (await db.select({ id: product.id }).from(product).where(and(eq(product.imageFileId, fileId), eq(product.active, true))).limit(1)).length) return true;
  const [hw] = await db.select({ id: homework.id }).from(homework).where(and(eq(homework.fileId, fileId), who.audience === 'teachers'
    ? inArray(homework.classId, who.classIds.length ? who.classIds : [0])
    : sql`exists (select 1 from homework_student hs where hs.homework_id = ${homework.id} and hs.student_id in ${who.studentIds.length ? who.studentIds : [0]})`)).limit(1);
  if (hw) return true;
  const students = who.audience === 'teachers'
    ? (who.classIds.length ? (await db.select({ id: classAssignment.studentId }).from(classAssignment).where(and(inArray(classAssignment.classId, who.classIds), isNull(classAssignment.toDate)))).map((r) => r.id) : [])
    : who.studentIds;
  if (students.length) {
    const [up] = await db.select({ id: homeworkStudent.homeworkId }).from(homeworkStudent).where(and(eq(homeworkStudent.uploadFileId, fileId), inArray(homeworkStudent.studentId, students))).limit(1);
    if (up) return true;
  }
  const [msg] = await db.select({ id: message.id }).from(message).innerJoin(messageParticipant, eq(messageParticipant.threadId, message.threadId))
    .where(and(eq(message.attachmentFileId, fileId), eq(messageParticipant.kind, who.party.kind), eq(messageParticipant.personId, who.party.id))).limit(1);
  return !!msg;
}
