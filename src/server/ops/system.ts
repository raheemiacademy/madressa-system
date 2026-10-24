import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { academicYear, adminStaff, apiKey, backup, calendarFeed, classAssignment, contact, event, holiday, jobRun, loginIdentity, mailQueue, schoolClass, student, workerHeartbeat } from '@/db/schema';
import { formatInstant } from '@/lib/dates';
import { LATEST } from '@/lib/releases';
import { audit, type AuditActor } from '../audit';
import { getProfile } from '../profile';
import { readTab } from '../settings';
import { backupsConfigured } from './backup';
import { log } from './logs';

/* §3 System page, §3 email delivery tracking, §19 calendar feed and developer API. */

/** "Check Automation Services Status": the worker beats every pass (15 seconds), so two minutes of silence means it's stopped. */
export async function systemStatus(db: DbOrTx, now = new Date()) {
  const [[beat], [daily], queue, [lastBackup], profile, [year], mail, [supers]] = await Promise.all([
    db.select().from(workerHeartbeat).where(eq(workerHeartbeat.process, 'worker')),
    db.select().from(jobRun).where(eq(jobRun.key, 'daily')),
    db.select({ status: mailQueue.status, n: sql<number>`count(*)::int` }).from(mailQueue).groupBy(mailQueue.status),
    db.select().from(backup).orderBy(desc(backup.createdAt)).limit(1),
    getProfile(db),
    db.select().from(academicYear).where(eq(academicYear.isCurrent, true)),
    readTab(db, 'mail'),
    db.select({ n: sql<number>`count(*)::int` }).from(adminStaff).where(and(eq(adminStaff.isSuper, true), isNull(adminStaff.deletedAt)))
  ]);
  const count = (s: string) => queue.find((q) => q.status === s)?.n ?? 0;
  const running = !!beat && now.getTime() - beat.lastBeat.getTime() < 2 * 60_000;
  return {
    version: LATEST.version, commit: (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? '').slice(0, 7) || 'local',
    worker: { running, lastBeat: beat?.lastBeat ?? null }, lastDaily: daily?.lastRunOn ?? null,
    mail: { queued: count('queued'), failed: count('failed'), sent: count('sent'), driver: process.env.EMAIL_DRIVER === 'smtp' ? 'Sending for real (SMTP)' : 'Test mode: logged, not sent' },
    sms: process.env.SMS_DRIVER && process.env.SMS_DRIVER !== 'log' ? `Sending with ${process.env.SMS_DRIVER}` : 'Test mode: logged, not sent',
    storage: process.env.STORAGE_DRIVER === 's3' ? 'S3-compatible storage' : 'This server’s disk',
    lastBackup: lastBackup ?? null,
    checklist: [
      { label: 'School name and address', done: !!profile?.name && !!profile.postcode, href: '/admin/settings/profile' },
      { label: 'A current academic year', done: !!year, href: '/admin/settings/years' },
      { label: 'School email address', done: !!profile?.email, href: '/admin/settings/profile' },
      { label: 'Mail settings', done: !!mail.sender || !!profile?.noReplyEmail, href: '/admin/settings/mail' },
      { label: 'Backups switched on (encryption key set)', done: backupsConfigured(), href: '/admin/tools/backups' },
      { label: 'A backup in the last two days', done: !!lastBackup && now.getTime() - lastBackup.createdAt.getTime() < 2 * 86_400_000, href: '/admin/tools/backups' },
      { label: 'Files kept off the server (S3 storage)', done: process.env.STORAGE_DRIVER === 's3', href: '/admin/tools/system' },
      { label: 'At least two super admins', done: (supers?.n ?? 0) >= 2, href: '/admin/settings/staff' }
    ]
  };
}

/* ───────── §3 Email delivery tracking ───────── */

export const sentMail = (db: DbOrTx, f: { q?: string; limit?: number } = {}) => db.select({
  m: mailQueue, sentBy: sql<string | null>`coalesce(${adminStaff.name}, ${loginIdentity.email})`
}).from(mailQueue).leftJoin(loginIdentity, eq(loginIdentity.id, mailQueue.createdBy)).leftJoin(adminStaff, eq(adminStaff.id, loginIdentity.adminStaffId))
  .where(and(eq(mailQueue.status, 'sent'), f.q ? sql`(lower(${mailQueue.toEmail}) like ${`%${f.q.toLowerCase()}%`} or lower(${mailQueue.subject}) like ${`%${f.q.toLowerCase()}%`})` : undefined))
  .orderBy(desc(mailQueue.sentAt)).limit(f.limit ?? 200);

/** "Delete mail logs before a date": sent emails only (queued and failed ones stay in the mail queue). */
export async function deleteMailBefore(db: DbOrTx, actor: AuditActor, date: string) {
  const n = (await db.delete(mailQueue).where(and(eq(mailQueue.status, 'sent'), lt(mailQueue.sentAt, new Date(`${date}T00:00:00Z`)))).returning({ id: mailQueue.id })).length;
  await audit(db, actor, { action: `Deleted ${n === 1 ? '1 sent email' : `${n} sent emails`} from before ${date}`, page: 'Email delivery', entity: 'mail_queue' });
  return n;
}

/* ───────── §19 Calendar (ICS) feed ───────── */

export async function feedToken(db: DbOrTx) {
  const [f] = await db.select().from(calendarFeed);
  if (f) return f.token;
  const token = randomBytes(18).toString('base64url');
  await db.insert(calendarFeed).values({ token }).onConflictDoNothing();
  return (await db.select().from(calendarFeed))[0]!.token;
}
export async function resetFeed(db: DbOrTx, actor: AuditActor) {
  const token = randomBytes(18).toString('base64url');
  await db.insert(calendarFeed).values({ token }).onConflictDoUpdate({ target: calendarFeed.id, set: { token, createdAt: new Date() } });
  await audit(db, actor, { action: 'Gave the calendar feed a new address (the old one stopped working)', page: 'System', entity: 'calendar_feed' });
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');
const day = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

/** The school calendar: holidays shown to parents, and active events, for the current and coming years. No personal data. */
export async function buildIcs(db: DbOrTx, token: string) {
  const [f] = await db.select().from(calendarFeed);
  if (!f || f.token !== token) return null;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [school, hols, evs] = await Promise.all([
    getProfile(db),
    db.select().from(holiday).where(and(eq(holiday.showParent, true), gte(holiday.endsOn, since))).orderBy(asc(holiday.startsOn)),
    db.select().from(event).where(and(eq(event.active, true), gte(event.date, since))).orderBy(asc(event.date))
  ]);
  const stamp = formatInstant(new Date(), "yyyyMMdd'T'HHmmss'Z'", 'UTC');
  const host = createHash('sha256').update(f.token).digest('hex').slice(0, 12);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//School admin//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(school?.name ?? 'School')}`, 'X-WR-TIMEZONE:Europe/London'];
  for (const h of hols) lines.push('BEGIN:VEVENT', `UID:holiday-${h.id}@${host}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(h.startsOn)}`, `DTEND;VALUE=DATE:${nextDay(h.endsOn)}`,
    `SUMMARY:${icsText(`${h.title} (no classes)`)}`, ...(h.description ? [`DESCRIPTION:${icsText(h.description)}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  for (const e of evs) {
    const when = e.time ? [`DTSTART;TZID=Europe/London:${day(e.date)}T${e.time.slice(0, 5).replace(':', '')}00`, `DURATION:PT${Math.max(1, e.durationMinutes || 60)}M`] : [`DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`];
    lines.push('BEGIN:VEVENT', `UID:event-${e.id}@${host}`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${icsText(e.name)}`, ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ───────── §19 Developer API (read-only) ───────── */

export const API_SCOPES = ['students', 'contacts'] as const;
const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');

export const listApiKeys = (db: DbOrTx) => db.select().from(apiKey).orderBy(desc(apiKey.createdAt));

/** A new key, returned once; only its hash is stored. */
export async function createApiKey(db: DbOrTx, actor: AuditActor, name: string, scopes: string[]) {
  const n = name.trim().slice(0, 60);
  const s = scopes.filter((x): x is (typeof API_SCOPES)[number] => (API_SCOPES as readonly string[]).includes(x));
  const errors: Record<string, string> = {};
  if (!n) errors.name = 'Say what the key is for';
  if (!s.length) errors.scopes = 'Choose what it can read';
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const key = `rak_${randomBytes(24).toString('base64url')}`;
  const [row] = await db.insert(apiKey).values({ name: n, prefix: key.slice(0, 10), keyHash: hashKey(key), scopes: s, createdBy: actor.name }).returning();
  await audit(db, actor, { action: `Created API key “${n}” (${s.join(', ')})`, page: 'Developer API', entity: 'api_key', entityId: row!.id });
  return { ok: true as const, key };
}

export async function revokeApiKey(db: DbOrTx, actor: AuditActor, id: number) {
  const [row] = await db.update(apiKey).set({ revokedAt: new Date() }).where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt))).returning();
  if (row) await audit(db, actor, { action: `Revoked API key “${row.name}”`, page: 'Developer API', entity: 'api_key', entityId: id });
}

/** The key behind an "Authorization: Bearer …" header, if it's live and has the scope. */
export async function apiKeyFor(db: Db, header: string | null, scope: string) {
  const m = /^Bearer (rak_[A-Za-z0-9_-]{20,60})$/.exec(header ?? '');
  if (!m) return null;
  const [k] = await db.select().from(apiKey).where(and(eq(apiKey.keyHash, hashKey(m[1]!)), isNull(apiKey.revokedAt)));
  if (!k || !k.scopes.includes(scope)) return null;
  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, k.id));
  await log(db, 'system', `API key “${k.name}” read ${scope}`);
  return k;
}

/** Students for the API: names, status, dates and current class. Medical notes and other sensitive fields are never included. */
export async function apiStudents(db: DbOrTx, page: number, perPage = 100) {
  const rows = await db.select({ s: student, className: schoolClass.name }).from(student)
    .leftJoin(classAssignment, and(eq(classAssignment.studentId, student.id), isNull(classAssignment.toDate)))
    .leftJoin(schoolClass, eq(schoolClass.id, classAssignment.classId))
    .orderBy(asc(student.id)).limit(perPage + 1).offset((page - 1) * perPage);
  return {
    data: rows.slice(0, perPage).map(({ s, className }) => ({ id: s.id, first_name: s.firstName, surname: s.surname, gender: s.gender, date_of_birth: s.dob, status: s.status, start_date: s.startDate, left_date: s.leftDate, class: className })),
    next_page: rows.length > perPage ? page + 1 : null
  };
}

/** Contacts for the API, with the students they're linked to. */
export async function apiContacts(db: DbOrTx, page: number, perPage = 100) {
  const rows = await db.select({ c: contact, links: sql<{ student_id: number; type: string; primary: boolean }[]>`coalesce((select json_agg(json_build_object('student_id', sc.student_id, 'type', sc.type, 'primary', sc.is_primary)) from student_contact sc where sc.contact_id = ${contact.id}), '[]'::json)` })
    .from(contact).orderBy(asc(contact.id)).limit(perPage + 1).offset((page - 1) * perPage);
  return {
    data: rows.slice(0, perPage).map(({ c, links }) => ({ id: c.id, name: c.name, email: c.email, mobile: c.mobile, tel: c.tel, postcode: c.postcode, students: links })),
    next_page: rows.length > perPage ? page + 1 : null
  };
}

