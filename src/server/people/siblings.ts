import { and, eq, or, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { siblingLink } from '@/db/schema';
import { audit } from '../audit';
import type { Actor } from './common';

const pair = (a: number, b: number) => (a < b ? { studentA: a, studentB: b } : { studentA: b, studentB: a });

export async function addSibling(db: Db, actor: Actor, a: number, b: number) {
  if (a === b) return { ok: false as const, error: 'Choose two different students' };
  await db.transaction(async (tx) => {
    await tx.insert(siblingLink).values({ ...pair(a, b), source: 'manual' }).onConflictDoNothing();
    await audit(tx, actor, { action: 'Added a sibling relation', page: 'Siblings', entity: 'sibling_link', entityId: `${Math.min(a, b)}:${Math.max(a, b)}` });
  });
  return { ok: true as const };
}

export async function removeSibling(db: Db, actor: Actor, a: number, b: number) {
  const p = pair(a, b);
  await db.transaction(async (tx) => {
    await tx.delete(siblingLink).where(and(eq(siblingLink.studentA, p.studentA), eq(siblingLink.studentB, p.studentB)));
    await audit(tx, actor, { action: 'Removed a sibling relation', page: 'Siblings', entity: 'sibling_link', entityId: `${p.studentA}:${p.studentB}` });
  });
}

/**
 * "Automatically find siblings": students who share a Parent contact.
 * Only current students unless includeAll. Returns new pairs; `save` stores them.
 */
export async function findSiblings(db: DbOrTx, includeAll = false) {
  return db.execute<{ a: number; b: number; a_name: string; b_name: string; contact: string }>(sql`
    select s1.id as a, s2.id as b, s1.first_name || ' ' || s1.surname as a_name, s2.first_name || ' ' || s2.surname as b_name, min(c.name) as contact
    from student_contact l1
    join student_contact l2 on l2.contact_id = l1.contact_id and l2.student_id > l1.student_id
    join student s1 on s1.id = l1.student_id join student s2 on s2.id = l2.student_id
    join contact c on c.id = l1.contact_id
    where l1.type = 'Parent' and l2.type = 'Parent'
      and (${includeAll} or (s1.status = 'Current' and s2.status = 'Current'))
      and not exists (select 1 from sibling_link sl where sl.student_a = s1.id and sl.student_b = s2.id)
    group by s1.id, s2.id order by a_name`);
}

export async function saveFoundSiblings(db: Db, actor: Actor, pairs: [number, number][]) {
  if (!pairs.length) return 0;
  await db.transaction(async (tx) => {
    await tx.insert(siblingLink).values(pairs.map(([a, b]) => ({ ...pair(a, b), source: 'auto' }))).onConflictDoNothing();
    await audit(tx, actor, { action: `Added ${pairs.length === 1 ? '1 sibling relation' : `${pairs.length} sibling relations`} found automatically`, page: 'Siblings', entity: 'sibling_link' });
  });
  return pairs.length;
}

/** Registered sibling relations, optionally narrowed by surname and to current students. */
export const listSiblings = (db: DbOrTx, opts: { surname?: string; includeAll?: boolean } = {}) => db.execute<{ a: number; b: number; a_name: string; b_name: string; a_status: string; b_status: string; source: string }>(sql`
  select s1.id as a, s2.id as b, s1.first_name || ' ' || s1.surname as a_name, s2.first_name || ' ' || s2.surname as b_name,
    s1.status as a_status, s2.status as b_status, sl.source
  from sibling_link sl join student s1 on s1.id = sl.student_a join student s2 on s2.id = sl.student_b
  where (${opts.includeAll ?? false} or (s1.status = 'Current' and s2.status = 'Current'))
    and (${opts.surname ?? ''} = '' or lower(s1.surname) like ${`${(opts.surname ?? '').toLowerCase()}%`} or lower(s2.surname) like ${`${(opts.surname ?? '').toLowerCase()}%`})
  order by s1.surname, a_name`);

/** All siblings of one student (for the profile and Quick Check). */
export const siblingsOf = (db: DbOrTx, id: number) => db.select().from(siblingLink).where(or(eq(siblingLink.studentA, id), eq(siblingLink.studentB, id)));
