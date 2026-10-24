import { createHash, randomBytes } from 'node:crypto';
import { TZDate } from '@date-fns/tz';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { kioskDevice, teacher, teacherHours, teacherLog } from '@/db/schema';
import { isoDate } from '@/lib/validate';
import { audit, type AuditActor } from '../audit';
import { hitRateLimit, verifyPassword } from '../auth';
import { todayIso } from '../people/common';
import { datesBetween, weekdayOf } from './registers';

const hhmm = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/, 'Use a time such as 17:05')]).optional().transform((v) => (v ? v.slice(0, 5) : null));
export const logInput = z.object({
  teacherId: z.coerce.number().int().positive(), date: isoDate,
  timeIn: hhmm, timeOut: hhmm,
  absent: z.union([z.literal('on'), z.literal(''), z.boolean()]).optional().transform((v) => v === 'on' || v === true),
  note: z.string().trim().max(300).optional().transform((v) => v || null)
}).refine((v) => !v.timeIn || !v.timeOut || v.timeOut >= v.timeIn, { path: ['timeOut'], message: 'Time out must be after time in' });

const activeTeachers = (db: DbOrTx) => db.select({ id: teacher.id, name: teacher.name }).from(teacher)
  .where(and(isNull(teacher.deletedAt), inArray(teacher.status, ['Employed', 'Volunteer']))).orderBy(asc(teacher.name));

/** Add/update logs (admin form or CSV import). A blank row with nothing set removes that day's log. */
export async function saveLogs(db: Db, actor: AuditActor & { identityId: number }, rows: unknown[], source: 'admin' | 'import' = 'admin') {
  const parsed = rows.map((r, i) => ({ i, r: logInput.safeParse(r) }));
  const bad = parsed.filter((p) => !p.r.success);
  if (bad.length) return { ok: false as const, errors: Object.fromEntries(bad.map((b) => [`row.${b.i}`, b.r.error!.issues[0]!.message])) };
  const ok = parsed.map((p) => p.r.data!);
  const known = new Set((await db.select({ id: teacher.id }).from(teacher).where(isNull(teacher.deletedAt))).map((t) => t.id));
  if (ok.some((r) => !known.has(r.teacherId))) return { ok: false as const, errors: { form: 'A row is for a teacher who doesn’t exist.' } };
  await db.transaction(async (tx) => {
    for (const r of ok) {
      if (!r.timeIn && !r.timeOut && !r.absent && !r.note) { await tx.delete(teacherLog).where(and(eq(teacherLog.teacherId, r.teacherId), eq(teacherLog.date, r.date))); continue; }
      const values = { timeIn: r.absent ? null : r.timeIn, timeOut: r.absent ? null : r.timeOut, absent: r.absent, note: r.note, source, updatedBy: actor.identityId, loggedAt: new Date() };
      await tx.insert(teacherLog).values({ teacherId: r.teacherId, date: r.date, ...values }).onConflictDoUpdate({ target: [teacherLog.teacherId, teacherLog.date], set: values });
    }
    await audit(tx, actor, { action: `Saved ${ok.length === 1 ? '1 teacher log' : `${ok.length} teacher logs`}${source === 'import' ? ' from CSV' : ''}`, page: 'Teacher logs', entity: 'teacher_log' });
  });
  return { ok: true as const, n: ok.length };
}

/** Weekly summary: every active teacher, seven days from the Monday given, with their log and expected hours. */
export async function weekLogs(db: DbOrTx, monday: string) {
  const days = datesBetween(monday, addDaysIso(monday, 6));
  const [teachers, logs, hours] = await Promise.all([
    activeTeachers(db),
    db.select().from(teacherLog).where(and(gte(teacherLog.date, days[0]!), lte(teacherLog.date, days[6]!))),
    db.select().from(teacherHours)
  ]);
  return {
    days,
    rows: teachers.map((t) => ({
      ...t,
      cells: days.map((d) => ({ date: d, log: logs.find((l) => l.teacherId === t.id && l.date === d) ?? null, expected: hours.find((h) => h.teacherId === t.id && h.weekday === weekdayOf(d)) ?? null }))
    }))
  };
}
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const mondayOf = (iso: string) => addDaysIso(iso, 1 - weekdayOf(iso));

/** Pending logs: past days a teacher was due to work (by working hours) with no log, or signed in but never out. */
export async function pendingLogs(db: DbOrTx, from: string, to: string) {
  const [teachers, logs, hours] = await Promise.all([
    activeTeachers(db),
    db.select().from(teacherLog).where(and(gte(teacherLog.date, from), lte(teacherLog.date, to))),
    db.select().from(teacherHours)
  ]);
  const out: { teacherId: number; name: string; date: string; reason: string; expected: string }[] = [];
  for (const d of datesBetween(from, to)) for (const t of teachers) {
    const h = hours.find((x) => x.teacherId === t.id && x.weekday === weekdayOf(d));
    const log = logs.find((l) => l.teacherId === t.id && l.date === d);
    if (h && !log) out.push({ teacherId: t.id, name: t.name, date: d, reason: 'No log', expected: `${h.startTime.slice(0, 5)}–${h.endTime.slice(0, 5)}` });
    else if (log && log.timeIn && !log.timeOut && d < todayIso()) out.push({ teacherId: t.id, name: t.name, date: d, reason: 'Signed in, never signed out', expected: h ? `${h.startTime.slice(0, 5)}–${h.endTime.slice(0, 5)}` : '' });
  }
  return out;
}

/** Absentees calendar for a month: logs marked absent, by day. */
export const absenteesBetween = (db: DbOrTx, from: string, to: string) => db.select({ date: teacherLog.date, name: teacher.name, note: teacherLog.note }).from(teacherLog)
  .innerJoin(teacher, eq(teacher.id, teacherLog.teacherId)).where(and(eq(teacherLog.absent, true), gte(teacherLog.date, from), lte(teacherLog.date, to))).orderBy(asc(teacherLog.date), asc(teacher.name));

/** Today's sign-ins (dashboard table: Teacher, Signed in, Signed out, Logged at). */
export const logsOn = (db: DbOrTx, date: string) => db.select({ name: teacher.name, timeIn: teacherLog.timeIn, timeOut: teacherLog.timeOut, absent: teacherLog.absent, loggedAt: teacherLog.loggedAt, source: teacherLog.source })
  .from(teacherLog).innerJoin(teacher, eq(teacher.id, teacherLog.teacherId)).where(eq(teacherLog.date, date)).orderBy(asc(teacher.name));

/** Sign in, or out if already in. Times are UK local time. Used by the teacher portal and the kiosk. */
export async function signInOrOut(db: Db, teacherId: number, source: 'portal' | 'kiosk', now = new Date()) {
  const local = new TZDate(now, 'Europe/London');
  const date = todayIso(now);
  const time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  return db.transaction(async (tx) => {
    const [log] = await tx.select().from(teacherLog).where(and(eq(teacherLog.teacherId, teacherId), eq(teacherLog.date, date))).limit(1);
    if (!log) {
      await tx.insert(teacherLog).values({ teacherId, date, timeIn: time, source, loggedAt: now });
      return { ok: true as const, did: 'in' as const, time };
    }
    if (log.timeIn && !log.timeOut) {
      await tx.update(teacherLog).set({ timeOut: time, loggedAt: now }).where(eq(teacherLog.id, log.id));
      return { ok: true as const, did: 'out' as const, time };
    }
    return { ok: false as const, error: 'Already signed out today. Ask the office to change your log.' };
  });
}

/* ───────── Kiosk devices ───────── */

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const KIOSK_COOKIE = 'kiosk_device';

export async function createKiosk(db: Db, actor: AuditActor & { identityId: number }, name: string) {
  const n = z.string().trim().min(1).max(60).safeParse(name);
  if (!n.success) return { ok: false as const, error: 'Give the device a name, for example “Front desk tablet”.' };
  const token = randomBytes(32).toString('base64url');
  await db.transaction(async (tx) => {
    const [d] = await tx.insert(kioskDevice).values({ name: n.data, tokenHash: sha(token), createdBy: actor.identityId }).returning();
    await audit(tx, actor, { action: `Set up kiosk device ${n.data}`, page: 'Teacher logs', entity: 'kiosk_device', entityId: d!.id });
  });
  return { ok: true as const, token };
}

export const validKiosk = async (db: DbOrTx, token: string | undefined) =>
  !!token && token.length < 100 && !!(await db.select({ id: kioskDevice.id }).from(kioskDevice).where(and(eq(kioskDevice.tokenHash, sha(token)), isNull(kioskDevice.revokedAt))).limit(1))[0];

export const listKiosks = (db: DbOrTx) => db.select().from(kioskDevice).where(isNull(kioskDevice.revokedAt)).orderBy(asc(kioskDevice.name));

export async function revokeKiosk(db: Db, actor: AuditActor, id: number) {
  await db.transaction(async (tx) => {
    await tx.update(kioskDevice).set({ revokedAt: new Date() }).where(eq(kioskDevice.id, id));
    await audit(tx, actor, { action: 'Removed a kiosk device', page: 'Teacher logs', entity: 'kiosk_device', entityId: id });
  });
}

/** Kiosk sign-in with a teacher's PIN. Five wrong PINs lock that teacher out of the kiosk for 15 minutes. */
export async function kioskSignIn(db: Db, token: string | undefined, teacherId: number, pin: string, now = new Date()) {
  if (!(await validKiosk(db, token))) return { ok: false as const, error: 'This device isn’t set up as a kiosk.' };
  if (!(await hitRateLimit(db, `kiosk:${teacherId}`, { hits: 5, windowMs: 15 * 60_000 }, now))) return { ok: false as const, error: 'Too many tries. Wait 15 minutes or ask the office.' };
  const [t] = await db.select({ id: teacher.id, name: teacher.name, pin: teacher.kioskPinHash }).from(teacher).where(and(eq(teacher.id, teacherId), isNull(teacher.deletedAt))).limit(1);
  if (!t?.pin || !/^\d{4,8}$/.test(pin) || !(await verifyPassword(t.pin, pin))) return { ok: false as const, error: 'That PIN isn’t right.' };
  await db.execute(sql`delete from rate_limit where key = ${`kiosk:${teacherId}`}`);
  const r = await signInOrOut(db, t.id, 'kiosk', now);
  return r.ok ? { ...r, name: t.name } : r;
}

export const kioskTeachers = (db: DbOrTx) => db.select({ id: teacher.id, name: teacher.name }).from(teacher)
  .where(and(isNull(teacher.deletedAt), sql`${teacher.kioskPinHash} is not null`, inArray(teacher.status, ['Employed', 'Volunteer']))).orderBy(asc(teacher.name));

export { activeTeachers };
