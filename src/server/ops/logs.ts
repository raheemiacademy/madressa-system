import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { appLog, LOG_KINDS } from '@/db/schema';
import { audit, type AuditActor } from '../audit';

/* §3 Logs: sign-ins, background jobs and notifications, shown with the audit trail. */

export type LogKind = (typeof LOG_KINDS)[number];
export const LOG_FILTERS = ['all', ...LOG_KINDS, 'audit'] as const;
export const PORTAL_LOG: Record<string, LogKind> = { admin: 'staff', teacher: 'teacher', parent: 'parent', student: 'student' };

/** Writes a log line. Logging must never break what it's logging, so a failure here is reported and swallowed. */
export async function log(db: DbOrTx, kind: LogKind, message: string, identityId: number | null = null, details?: Record<string, unknown>) {
  try {
    await db.insert(appLog).values({ kind, message: message.slice(0, 500), identityId, details: details ?? null });
  } catch (e) {
    console.error('[log] could not write:', (e as Error).message);
  }
}

export type LogRow = { at: Date; kind: string; message: string; who: string | null };

/** Newest first: the chosen kind, or everything (including the audit trail). Searches the message and who. */
export async function listLogs(db: DbOrTx, f: { kind?: string; q?: string; page?: number }, perPage = 100) {
  const kind = (LOG_FILTERS as readonly string[]).includes(f.kind ?? '') ? f.kind! : 'all';
  const q = f.q?.trim().toLowerCase().slice(0, 80);
  const like = q ? `%${q}%` : null;
  const logs = sql`select l.at, l.kind, l.message, coalesce(a.name, t.name, c.name, s.first_name || ' ' || s.surname, i.email) as who
    from app_log l left join login_identity i on i.id = l.identity_id left join admin_staff a on a.id = i.admin_staff_id left join teacher t on t.id = i.teacher_id
    left join contact c on c.id = i.contact_id left join student s on s.id = i.student_id
    where (${kind} = 'all' or l.kind = ${kind})`;
  const audits = sql`select at, 'audit' as kind, page || ': ' || action as message, actor_name as who from audit_log where ${kind} in ('all', 'audit')`;
  const page = Math.max(1, Math.min(1000, Math.floor(f.page ?? 1)));
  const rows = await db.execute<{ at: string; kind: string; message: string; who: string | null }>(sql`select * from (${logs} union all ${audits}) x
    where ${like}::text is null or lower(x.message) like ${like} or lower(coalesce(x.who, '')) like ${like}
    order by x.at desc limit ${perPage + 1} offset ${(page - 1) * perPage}`);
  const list = [...rows].map((r) => ({ ...r, at: new Date(r.at) }));
  return { rows: list.slice(0, perPage) as LogRow[], more: list.length > perPage, page, kind };
}

/** "Delete All Logs". The audit trail is kept: it's the school's record of who changed what. */
export async function deleteAllLogs(db: DbOrTx, actor: AuditActor) {
  const n = (await db.delete(appLog).returning({ id: appLog.id })).length;
  await audit(db, actor, { action: `Deleted all logs (${n === 1 ? '1 line' : `${n} lines`}); the audit trail was kept`, page: 'Logs', entity: 'app_log' });
  return n;
}
