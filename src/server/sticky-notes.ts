import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { stickyNote } from '@/db/schema';
import { PALETTE_COLOURS } from '@/settings/tabs';

export const noteInput = z.object({
  pagePath: z.string().regex(/^\/admin(\/[\w\-/]*)?$/, 'Bad page').max(200),
  body: z.string().trim().min(1, 'Write a note').max(2000),
  colour: z.enum(PALETTE_COLOURS.map((c) => c.value) as [string, ...string[]])
});

export const notesForPage = (db: DbOrTx, pagePath: string) => db.select().from(stickyNote).where(eq(stickyNote.pagePath, pagePath)).orderBy(asc(stickyNote.createdAt));
export const allNotes = (db: DbOrTx) => db.select().from(stickyNote).orderBy(desc(stickyNote.updatedAt));

type Actor = { identityId: number; isSuper: boolean };
const mayChange = (a: Actor, createdBy: number | null) => a.isSuper || createdBy === a.identityId;

export async function addNote(db: Db, actor: Actor, raw: unknown) {
  const p = noteInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the note' };
  await db.insert(stickyNote).values({ ...p.data, createdBy: actor.identityId });
  return { ok: true as const };
}

export async function updateNote(db: Db, actor: Actor, id: number, body: string) {
  const text = z.string().trim().min(1).max(2000).safeParse(body);
  if (!text.success) return { ok: false as const, error: 'Write a note' };
  const [n] = await db.select().from(stickyNote).where(eq(stickyNote.id, id)).limit(1);
  if (!n || !mayChange(actor, n.createdBy)) return { ok: false as const, error: 'You can only edit your own notes.' };
  await db.update(stickyNote).set({ body: text.data, updatedAt: new Date() }).where(eq(stickyNote.id, id));
  return { ok: true as const };
}

export async function deleteNote(db: Db, actor: Actor, id: number) {
  const [n] = await db.select().from(stickyNote).where(eq(stickyNote.id, id)).limit(1);
  if (!n || !mayChange(actor, n.createdBy)) return { ok: false as const, error: 'You can only delete your own notes.' };
  await db.delete(stickyNote).where(eq(stickyNote.id, id));
  return { ok: true as const };
}
