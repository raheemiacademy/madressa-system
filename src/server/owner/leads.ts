import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { earlyAccessSignup, lead, LEAD_STATUSES } from '@/db/schema';
import { audit } from '../audit';

/*
 * The owner dashboard's leads inbox (OWNER-DASHBOARD.md, "4. Leads"): early-access sign-ups and contact-form messages together,
 * newest first, each with a status and the owner's notes. Nothing here creates a madrasah.
 */
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type Lead = {
  id: number; kind: 'Early access' | 'Contact form'; receivedAt: Date; status: LeadStatus; notes: string;
  name: string; email: string; school: string | null; role: string | null; students: number | null; type: string | null; topic: string | null; message: string | null;
};

export async function listLeads(db: DbOrTx): Promise<Lead[]> {
  const rows = await db.select({ l: lead, s: earlyAccessSignup }).from(lead).leftJoin(earlyAccessSignup, eq(earlyAccessSignup.id, lead.signupId))
    .orderBy(desc(lead.createdAt), desc(lead.id));
  return rows.map(({ l, s }) => ({
    id: l.id, kind: l.kind === 'early_access' ? 'Early access' : 'Contact form', receivedAt: l.createdAt, status: l.status as LeadStatus, notes: l.notes ?? '',
    name: s?.name ?? l.name ?? '', email: s?.email ?? l.email ?? '', school: s?.school ?? l.school, role: s?.role ?? null, students: s?.students ?? null,
    type: s?.type ?? null, topic: l.topic, message: l.message
  }));
}

export const countNewLeads = async (db: DbOrTx) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(lead).where(eq(lead.status, 'New')))[0]!.n;

type Actor = { identityId: number; name: string };
const statusInput = z.enum(LEAD_STATUSES);

export async function setLeadStatus(db: Db, actor: Actor, id: number, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = statusInput.safeParse(raw);
  if (!status.success) return { ok: false, error: 'Choose one of the statuses.' };
  const [row] = await db.update(lead).set({ status: status.data, updatedAt: new Date() }).where(eq(lead.id, id)).returning({ id: lead.id });
  if (!row) return { ok: false, error: 'That lead no longer exists.' };
  await audit(db, actor, { action: `Set a lead to “${status.data}”`, page: 'Owner', entity: 'lead', entityId: id });
  return { ok: true };
}

export const NOTES_MAX = 5000;
export async function setLeadNotes(db: Db, actor: Actor, id: number, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof raw !== 'string') return { ok: false, error: 'Notes must be text.' };
  if (raw.length > NOTES_MAX) return { ok: false, error: `Keep notes under ${NOTES_MAX} characters.` };
  const [row] = await db.update(lead).set({ notes: raw.trim() || null, updatedAt: new Date() }).where(eq(lead.id, id)).returning({ id: lead.id });
  if (!row) return { ok: false, error: 'That lead no longer exists.' };
  await audit(db, actor, { action: 'Changed a lead’s notes', page: 'Owner', entity: 'lead', entityId: id });
  return { ok: true };
}

/** The command that adds a lead's school as a madrasah on the server: a short name from its first two words, at <name>.<main site's host>. */
export function setupCommand(l: Pick<Lead, 'school' | 'name'>, mainHost: string) {
  const words = (l.school || l.name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  // ./madrasah add takes 2-30 lowercase letters, digits or dashes; a name in another script leaves a placeholder to change.
  const short = words.slice(0, 2).join('-').slice(0, 30).replace(/-+$/, '');
  const slug = short.length >= 2 ? short : 'new-madrasah';
  return `./madrasah add ${slug} ${slug}.${mainHost}`;
}
