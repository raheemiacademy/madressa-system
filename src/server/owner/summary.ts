import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { LATEST } from '@/lib/releases';

/*
 * GET /api/owner/summary on every madrasah copy: what the owner dashboard on the main site may know about this madrasah.
 * Counts only — never a child's or parent's name or details. Answered only on the server's private network (never through
 * the public address) and only with OWNER_SUMMARY_TOKEN.
 */
export type Summary = {
  version: string;
  counts: { students: number; teachers: number; staff: number; parents: number; parentsWithLogin: number };
  lastActiveAt: string | null;
};

const PRIVATE_V4 = [/^10\./, /^127\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
export function isPrivateAddress(raw: string) {
  const ip = raw.trim().replace(/^::ffff:/i, '');
  if (isIP(ip) === 4) return PRIVATE_V4.some((r) => r.test(ip));
  if (isIP(ip) === 6) return ip === '::1' || /^f[cd]/i.test(ip);
  return false;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * 404 when this copy has no token (the endpoint doesn't exist), 403 for anything that came through the public address,
 * 401 without the right token. Caddy sets X-Forwarded-For to the visitor's real address and ignores one sent by the visitor;
 * a request from another container has only its own private address there (Next fills it in from the connection).
 */
export function summaryAccess(headers: Headers): 200 | 401 | 403 | 404 {
  const token = process.env.OWNER_SUMMARY_TOKEN ?? '';
  if (token.length < 32) return 404;
  const hops = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!hops.every(isPrivateAddress)) return 403;
  const publicHost = (() => { try { return new URL(process.env.APP_URL ?? '').host; } catch { return ''; } })();
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? '';
  if (publicHost && host.toLowerCase() === publicHost.toLowerCase()) return 403;
  const given = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return given && timingSafeEqual(digest(given), digest(token)) ? 200 : 401;
}

export async function buildSummary(db: DbOrTx): Promise<Summary> {
  const [row] = await db.execute<{ students: number; teachers: number; staff: number; parents: number; parents_with_login: number; last_active: Date | string | null }>(sql`
    with parents as (
      select distinct c.id, c.email from contact c
      join student_contact sc on sc.contact_id = c.id and sc.type = 'Parent'
      join student s on s.id = sc.student_id and s.status = 'Current'
      where c.active
    )
    select
      (select count(*)::int from student where status = 'Current') as students,
      (select count(*)::int from teacher where deleted_at is null and status in ('Employed', 'Volunteer')) as teachers,
      (select count(*)::int from admin_staff where deleted_at is null) as staff,
      (select count(*)::int from parents) as parents,
      (select count(*)::int from parents p join login_identity li on li.contact_id = p.id and li.password_hash is not null) as parents_with_login,
      (select greatest((select max(last_login_at) from login_identity where portal <> 'owner'), (select max(last_seen_at) from session where portal <> 'owner'))) as last_active
  `);
  const r = row!;
  return {
    version: LATEST.version,
    counts: { students: r.students, teachers: r.teachers, staff: r.staff, parents: r.parents, parentsWithLogin: r.parents_with_login },
    lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null
  };
}
