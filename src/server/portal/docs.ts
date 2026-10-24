import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { fileObject, SHARED_DOC_AUDIENCES, sharedDoc } from '@/db/schema';
import { zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from '../people/common';
import { readTab } from '../settings';
import { removeStored, storeAttachment } from '../storage';

/* §20 Shared documents: the office uploads them for parents, teachers or both, optionally only for some classes. */

export const docInput = z.object({
  title: z.string().trim().min(1, 'Give the document a title').max(120),
  audience: z.enum(SHARED_DOC_AUDIENCES),
  classIds: z.array(z.coerce.number().int().positive()).max(200).default([])
});

export const listDocs = (db: DbOrTx) => db.select({ d: sharedDoc, filename: fileObject.filename, size: fileObject.size }).from(sharedDoc)
  .innerJoin(fileObject, eq(fileObject.id, sharedDoc.fileId)).orderBy(desc(sharedDoc.createdAt));

export async function addDoc(db: Db, actor: Actor, raw: unknown, file: File | null) {
  const p = docInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  if (!file || !file.size) return { ok: false as const, errors: { file: 'Choose a file' } };
  const allowed = (await readTab(db, 'storage')).allowedExtensions as string[];
  const up = await storeAttachment(db, file, allowed, 'shared-doc', actor.identityId);
  if (!up.ok) return { ok: false as const, errors: { file: up.error } };
  const [row] = await db.insert(sharedDoc).values({ ...p.data, fileId: up.file.id, createdBy: actor.name }).returning();
  await audit(db, actor, { action: `Shared “${p.data.title}” with ${p.data.audience === 'both' ? 'parents and teachers' : p.data.audience}`, page: 'Shared files', entity: 'shared_doc', entityId: row!.id });
  return { ok: true as const };
}

/** Deletes the document and its stored file. */
export async function deleteDoc(db: Db, actor: Actor, id: number) {
  const [d] = await db.select({ d: sharedDoc, key: fileObject.storageKey }).from(sharedDoc).innerJoin(fileObject, eq(fileObject.id, sharedDoc.fileId)).where(eq(sharedDoc.id, id));
  if (!d) return { ok: false as const, error: 'Already deleted' };
  await db.delete(fileObject).where(eq(fileObject.id, d.d.fileId)); // cascades to the shared_doc row
  await removeStored(d.key);
  await audit(db, actor, { action: `Deleted shared document “${d.d.title}”`, page: 'Shared files', entity: 'shared_doc', entityId: id });
  return { ok: true as const };
}
