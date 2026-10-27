import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db';
import { adminStaff, invoice, schoolClass, timetableSlot } from '@/db/schema';
import { ACCESS_LEVELS } from '@/lib/access-levels';
import { LATEST } from '@/lib/releases';
import { currentYear } from '../academic-years';
import { addDays, closures, datesBetween, monthRange, weekdayOf } from '../attendance/registers';
import { invoiceRows, totals, type InvoiceRow } from '../fees/invoices';
import { LEFT_STATUSES, todayIso } from '../people/common';

/*
 * GET /api/owner/summary on every madrasah copy: what the owner dashboard on the main site may know about this madrasah.
 * Counts, money totals and the admin users' contacts — never a child's or parent's name or details. Answered only on the
 * server's private network (never through the public address) and only with OWNER_SUMMARY_TOKEN.
 */
export type Money = { invoiced: number; collected: number; overdue: number; familiesOverdue: number }; // pence
export type Summary = {
  version: string;
  counts: { students: number; teachers: number; staff: number; parents: number; parentsWithLogin: number };
  lastActiveAt: string | null;
  usage: {
    byStatus: { current: number; waiting: number; onHold: number; leftThisYear: number };
    classes: number;
    logins: { last7: number; last30: number };
    registersThisWeek: { taken: number; planned: number };
    thisMonth: { messages: number; homework: number; incidents: number };
    errors24h: number;
  };
  /** The last 8 weeks, oldest first; the last is this week (Monday to Sunday, UK time). */
  weeks: { start: string; students: number; registers: number; logins: number; parentLogins: number; messages: number }[];
  money: { month: Money; year: Money };
  admins: { name: string; email: string; phone: string | null; access: string }[];
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

/** Totals only. A family is the invoice's billing contact, or the student when there is none. */
function money(rows: InvoiceRow[]): Money {
  const t = totals(rows);
  const overdue = rows.filter((r) => r.status === 'Overdue');
  return { invoiced: t.due, collected: t.received, overdue: t.overdue, familiesOverdue: new Set(overdue.map((r) => r.billingContactId ? `c${r.billingContactId}` : `s${r.studentId}`)).size };
}

/** Registers the timetable expects in a date range: each register-taking slot of a current class, minus holidays and closed days. */
async function plannedRegisters(db: DbOrTx, yearId: number, from: string, to: string) {
  const classes = await db.select({ id: schoolClass.id, startsOn: schoolClass.startsOn, endsOn: schoolClass.endsOn }).from(schoolClass).where(eq(schoolClass.academicYearId, yearId));
  if (!classes.length) return 0;
  const slots = await db.select({ classId: timetableSlot.classId, weekday: timetableSlot.weekday }).from(timetableSlot)
    .where(and(inArray(timetableSlot.classId, classes.map((c) => c.id)), eq(timetableSlot.takesRegister, true)));
  const closed = await closures(db, classes.map((c) => c.id), from, to);
  let n = 0;
  for (const date of datesBetween(from, to)) for (const s of slots) {
    const c = classes.find((x) => x.id === s.classId)!;
    if (s.weekday === weekdayOf(date) && (!c.startsOn || date >= c.startsOn) && (!c.endsOn || date <= c.endsOn) && !closed(c.id, date)) n++;
  }
  return n;
}

const accessOf = (s: typeof adminStaff.$inferSelect) => s.isSuper ? 'Super' : ACCESS_LEVELS.filter(([k]) => k !== 'isSuper' && s[k]).map(([, label]) => label).join(', ') || 'View only';

export async function buildSummary(db: DbOrTx, now = new Date()): Promise<Summary> {
  const today = todayIso(now), monday = addDays(today, 1 - weekdayOf(today)), sunday = addDays(monday, 6), first = addDays(monday, -49);
  const month = monthRange(today.slice(0, 7)), year = await currentYear(db);
  const left = sql.raw(LEFT_STATUSES.map((s) => `'${s}'`).join(', '));
  const signIns = sql`l.message = 'Signed in' and l.kind in ('staff', 'teacher', 'parent', 'student')`;
  const ukDay = (col: string) => sql.raw(`(${col} at time zone 'Europe/London')::date`);
  const [[c], weeks, monthRows, yearRows, planned, admins] = await Promise.all([
    db.execute<Record<string, number | Date | string | null>>(sql`
      with parents as (
        select distinct c.id from contact c
        join student_contact sc on sc.contact_id = c.id and sc.type = 'Parent'
        join student s on s.id = sc.student_id and s.status = 'Current'
        where c.active
      )
      select
        (select count(*)::int from student where status = 'Current') as students,
        (select count(*)::int from student where status = 'Waiting List') as waiting,
        (select count(*)::int from student where status = 'On Hold') as on_hold,
        (select count(*)::int from student where status in (${left}) and left_date >= ${year?.startsOn ?? today}::date) as left_this_year,
        (select count(*)::int from teacher where deleted_at is null and status in ('Employed', 'Volunteer')) as teachers,
        (select count(*)::int from admin_staff where deleted_at is null) as staff,
        (select count(*)::int from parents) as parents,
        (select count(*)::int from parents p join login_identity li on li.contact_id = p.id and li.password_hash is not null) as parents_with_login,
        (select greatest((select max(last_login_at) from login_identity where portal <> 'owner'), (select max(last_seen_at) from session where portal <> 'owner'))) as last_active,
        (select count(*)::int from school_class where academic_year_id = ${year?.id ?? 0}) as classes,
        (select count(*)::int from app_log l where ${signIns} and l.at > ${now.toISOString()}::timestamptz - interval '7 days') as logins7,
        (select count(*)::int from app_log l where ${signIns} and l.at > ${now.toISOString()}::timestamptz - interval '30 days') as logins30,
        (select count(*)::int from register_session where taken_at is not null and date between ${monday}::date and ${sunday}::date) as registers_week,
        (select count(*)::int from message m where ${ukDay('m.created_at')} between ${month.from}::date and ${month.to}::date) as messages_month,
        (select count(*)::int from homework h where ${ukDay('h.created_at')} between ${month.from}::date and ${month.to}::date) as homework_month,
        (select count(*)::int from incident i where ${ukDay('i.occurred_at')} between ${month.from}::date and ${month.to}::date) as incidents_month,
        (select count(*)::int from app_log l where l.at > ${now.toISOString()}::timestamptz - interval '24 hours' and (l.message ilike '%failed%' or l.message ilike '%error%')) as errors24h
    `),
    db.execute<{ start: string; students: number; registers: number; logins: number; parent_logins: number; messages: number }>(sql`
      select w.s::text as start,
        (select count(*)::int from student st where (st.start_date is null or st.start_date <= w.s + 6)
          and (st.status = 'Current' or (st.status in (${left}) and st.left_date > w.s + 6 and st.start_date is not null))) as students,
        (select count(*)::int from register_session r where r.taken_at is not null and r.date between w.s and w.s + 6) as registers,
        (select count(*)::int from app_log l where ${signIns} and ${ukDay('l.at')} between w.s and w.s + 6) as logins,
        (select count(*)::int from app_log l where l.message = 'Signed in' and l.kind = 'parent' and ${ukDay('l.at')} between w.s and w.s + 6) as parent_logins,
        (select count(*)::int from message m where ${ukDay('m.created_at')} between w.s and w.s + 6) as messages
      from (select generate_series(${first}::date, ${monday}::date, interval '7 days')::date as s) w order by w.s
    `),
    invoiceRows(db, and(gte(invoice.invoiceDate, month.from), lte(invoice.invoiceDate, month.to)), today),
    year ? invoiceRows(db, eq(invoice.academicYearId, year.id), today) : Promise.resolve([]),
    year ? plannedRegisters(db, year.id, monday, sunday) : Promise.resolve(0),
    db.select().from(adminStaff).where(isNull(adminStaff.deletedAt)).orderBy(sql`${adminStaff.isSuper} desc`, adminStaff.name)
  ]);
  const n = (k: string) => Number(c![k] ?? 0);
  return {
    version: LATEST.version,
    counts: { students: n('students'), teachers: n('teachers'), staff: n('staff'), parents: n('parents'), parentsWithLogin: n('parents_with_login') },
    lastActiveAt: c!.last_active ? new Date(c!.last_active as string).toISOString() : null,
    usage: {
      byStatus: { current: n('students'), waiting: n('waiting'), onHold: n('on_hold'), leftThisYear: n('left_this_year') },
      classes: n('classes'),
      logins: { last7: n('logins7'), last30: n('logins30') },
      registersThisWeek: { taken: n('registers_week'), planned },
      thisMonth: { messages: n('messages_month'), homework: n('homework_month'), incidents: n('incidents_month') },
      errors24h: n('errors24h')
    },
    weeks: weeks.map((w) => ({ start: w.start, students: w.students, registers: w.registers, logins: w.logins, parentLogins: w.parent_logins, messages: w.messages })),
    money: { month: money(monthRows), year: money(yearRows) },
    admins: admins.map((s) => ({ name: s.name, email: s.email, phone: s.mobile || s.phone || null, access: accessOf(s) }))
  };
}
