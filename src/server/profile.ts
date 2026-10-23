import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { schoolProfile } from '@/db/schema';
import { optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit, type AuditActor } from './audit';

const optEmail = z.union([z.literal(''), z.email('Enter a valid email address').max(200)]).optional().transform((v) => v || null);

export const profileInput = z.object({
  name: z.string().trim().min(1, 'Add the school name').max(120),
  logoUrl: z.union([z.literal(''), z.url({ protocol: /^https$/, error: 'Use a full https:// address' }).max(500)]).optional().transform((v) => v || null),
  address: optionalText(300), city: optionalText(80), postcode: optionalText(12),
  email: optEmail, noReplyEmail: optEmail, bccEmail: optEmail, receiptSenderEmail: optEmail,
  receiptSenderName: optionalText(120), tel: optionalText(40), fax: optionalText(40)
});

export const getProfile = async (db: DbOrTx) => (await db.select().from(schoolProfile).where(eq(schoolProfile.id, 1)).limit(1))[0] ?? null;

/** logoFileId: new upload ID, null to remove, undefined to keep. */
export async function saveProfile(db: Db, actor: AuditActor, raw: unknown, logoFileId?: string | null): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const p = profileInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const values = { ...p.data, ...(logoFileId !== undefined ? { logoFileId } : {}), updatedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx.insert(schoolProfile).values({ id: 1, ...values }).onConflictDoUpdate({ target: schoolProfile.id, set: values });
    await audit(tx, actor, { action: 'Updated the school profile', page: 'School profile', entity: 'school_profile', entityId: 1 });
  });
  return { ok: true };
}


/** Typed-name confirmation for destructive actions: case, spacing and curly quotes don't matter. */
export const normaliseName = (s: string) => s.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-GB');
export async function confirmsSchoolName(db: DbOrTx, typed: string) {
  const p = await getProfile(db);
  return !!p && normaliseName(typed) === normaliseName(p.name);
}
