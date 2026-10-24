import { timingSafeEqual } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, adminStaff, contact, feeStructure, loginIdentity, onboarding, schoolClass, schoolProfile, student, studentContact, teacher } from '@/db/schema';
import { STEPS, type StepKey } from '@/lib/onboarding-steps';
import { LATEST } from '@/lib/releases';
import { zodErrors } from '@/lib/validate';
import { audit, type AuditActor } from './audit';
import { createSession, hashPassword, hitRateLimit, passwordProblem, sha256 } from './auth';
import { log } from './ops/logs';
import { syncPortalLogin } from './people/logins';
import { sendPasswordLink } from './password-links';
import { readTab } from './settings';

/* First-time setup of a new madrasah: the first admin account, then the "Set up your madrasah" checklist on the dashboard. */

/* ───────── First admin ───────── */

/** A new installation has no admin staff yet; until one exists, /admin/setup is open (with the setup code). */
export const needsFirstAdmin = async (db: DbOrTx) => !(await db.select({ id: adminStaff.id }).from(adminStaff).limit(1)).length;

const same = (a: string, b: string) => { const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b)); return timingSafeEqual(x, y); };

export const setupInput = z.object({
  code: z.string().max(200),
  school: z.string().trim().min(2, 'Enter the madrasah’s name').max(120),
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.email('Enter a valid email address').max(200).transform((e) => e.toLowerCase()),
  password: z.string().max(200)
});

/**
 * Creates the school and its first super admin, and signs them in. Only works while there are no admin staff at all,
 * and only with the setup code the person who installed it chose (SETUP_CODE), so a stranger who finds a new site can't claim it.
 */
export async function setUpSchool(db: Db, raw: unknown, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const expected = process.env.SETUP_CODE ?? '';
  if (expected.length < 8) return { ok: false as const, error: 'This site isn’t ready to be set up: whoever installed it needs to set SETUP_CODE (8 characters or more).' };
  if (!(await hitRateLimit(db, `setup:${meta.ip ?? 'any'}`, { hits: 10, windowMs: 15 * 60_000 }))) return { ok: false as const, error: 'Too many tries. Wait a few minutes and try again.' };
  const p = setupInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  if (!same(v.code.trim(), expected)) return { ok: false as const, errors: { code: 'That setup code isn’t right' } };
  const problem = passwordProblem(v.password);
  if (problem) return { ok: false as const, errors: { password: problem } };
  const hash = await hashPassword(v.password);
  return db.transaction(async (tx) => {
    if (!(await needsFirstAdmin(tx))) return { ok: false as const, error: 'This madrasah has already been set up. Sign in instead.' };
    await tx.insert(schoolProfile).values({ id: 1, name: v.school }).onConflictDoUpdate({ target: schoolProfile.id, set: { name: v.school, updatedAt: new Date() } });
    const [s] = await tx.insert(adminStaff).values({ name: v.name, email: v.email, rank: 'Head Administrator', isSuper: true, seenRelease: LATEST.version }).returning();
    const [i] = await tx.insert(loginIdentity).values({ portal: 'admin', email: v.email, passwordHash: hash, adminStaffId: s!.id, emailVerifiedAt: new Date(), lastLoginAt: new Date() }).returning();
    await tx.insert(onboarding).values({ id: 1 }).onConflictDoNothing();
    await audit(tx, { identityId: i!.id, name: v.name }, { action: `Set up ${v.school} and created the first admin account`, page: 'Setup', entity: 'admin_staff', entityId: s!.id });
    await log(tx, 'staff', 'Created the first admin account and signed in', i!.id);
    const session = await createSession(tx, i!.id, 'admin', meta);
    return { ok: true as const, ...session };
  });
}

/* ───────── The setup checklist ───────── */


/** Where the school is with each step. Steps are done when the data is there, not when someone clicks "done". */
export async function setupProgress(db: DbOrTx) {
  const [[state], profile, [year]] = await Promise.all([
    db.select().from(onboarding).where(eq(onboarding.id, 1)),
    db.select().from(schoolProfile).where(eq(schoolProfile.id, 1)).then((r) => r[0] ?? null),
    db.select().from(academicYear).where(eq(academicYear.isCurrent, true))
  ]);
  const one = async (q: Promise<unknown[]>) => (await q).length > 0;
  const [classes, teachers, students, fees, portalUsers] = await Promise.all([
    year ? one(db.select({ id: schoolClass.id }).from(schoolClass).where(eq(schoolClass.academicYearId, year.id)).limit(1)) : false,
    one(db.select({ id: teacher.id }).from(teacher).where(isNull(teacher.deletedAt)).limit(1)),
    one(db.select({ id: student.id }).from(student).where(eq(student.status, 'Current')).limit(1)),
    year ? one(db.select({ id: feeStructure.id }).from(feeStructure).where(eq(feeStructure.academicYearId, year.id)).limit(1)) : false,
    one(db.select({ id: loginIdentity.id }).from(loginIdentity).where(and(inArray(loginIdentity.portal, ['parent', 'teacher']), isNotNull(loginIdentity.lastLoginAt))).limit(1))
  ]);
  const done: Record<StepKey, boolean> = {
    details: !!profile?.name && !!profile.email && !!(profile.postcode || profile.address),
    year: !!year,
    classes: classes && teachers,
    students,
    fees,
    invite: !!state?.invitedAt || portalUsers
  };
  const skipped = state?.skipped ?? [];
  const steps = STEPS.map((s, i) => ({ ...s, n: i + 1, done: done[s.key], skipped: !done[s.key] && skipped.includes(s.key) }));
  const finished = steps.filter((s) => s.done || s.skipped).length;
  return { steps, finished, total: steps.length, next: steps.find((s) => !s.done && !s.skipped) ?? null, hidden: !!state?.hiddenAt, complete: finished === steps.length };
}

async function update(db: DbOrTx, set: Partial<typeof onboarding.$inferInsert>) {
  await db.insert(onboarding).values({ id: 1, ...set }).onConflictDoUpdate({ target: onboarding.id, set: { ...set, updatedAt: new Date() } });
}

/** Skip an optional step (fees, invites), or bring it back. */
export async function skipStep(db: DbOrTx, actor: AuditActor, key: string, skip: boolean) {
  const step = STEPS.find((s) => s.key === key);
  if (!step || !('optional' in step)) return;
  const [state] = await db.select().from(onboarding).where(eq(onboarding.id, 1));
  const now = new Set(state?.skipped ?? []);
  if (skip) now.add(key); else now.delete(key);
  await update(db, { skipped: [...now] });
  await audit(db, actor, { action: `${skip ? 'Skipped' : 'Brought back'} the setup step “${step.title}”`, page: 'Setup' });
}

/** Hide the checklist from the dashboard (it can be shown again from System), or show it again. */
export const hideChecklist = (db: DbOrTx, hide: boolean) => update(db, { hiddenAt: hide ? new Date() : null });

/* ───────── Step 6: invite parents and teachers ───────── */

/**
 * Gives every active teacher, and every parent contact of a current student (of the contact types the parent portal allows),
 * who has an email address but no login yet, a login. Then emails everyone who hasn't chosen a password a one-time link to do so.
 * Safe to run again: people who already have a password aren't emailed.
 */
export async function invitePortalUsers(db: Db, actor: AuditActor) {
  const types = ((await readTab(db, 'parentPortal')).contactTypesAllowed as string[]) ?? ['Parent'];
  const [teachers, parents] = await Promise.all([
    db.select({ id: teacher.id, email: teacher.email }).from(teacher).where(and(isNull(teacher.deletedAt), inArray(teacher.status, ['Employed', 'Volunteer']), isNotNull(teacher.email))),
    db.selectDistinct({ id: contact.id, email: contact.email }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).innerJoin(student, eq(student.id, studentContact.studentId))
      .where(and(eq(student.status, 'Current'), inArray(studentContact.type, (types.length ? types : ['Parent']) as never[]), isNotNull(contact.email)))
  ]);
  let created = 0, skipped = 0;
  for (const [portal, rows] of [['teacher', teachers], ['parent', parents]] as const) {
    for (const r of rows) {
      const existing = await db.select({ id: loginIdentity.id }).from(loginIdentity).where(eq(portal === 'teacher' ? loginIdentity.teacherId : loginIdentity.contactId, r.id)).limit(1);
      if (existing.length) continue;
      const problem = await syncPortalLogin(db, portal, r.id, r.email!, '');
      if (problem) skipped++; else created++;
    }
  }
  const waiting = await db.select().from(loginIdentity).where(and(inArray(loginIdentity.portal, ['parent', 'teacher']), isNull(loginIdentity.passwordHash), eq(loginIdentity.allowLogin, true)));
  let emailed = 0;
  for (const idn of waiting) if (await sendPasswordLink(db, idn, actor.identityId)) emailed++;
  await update(db, { invitedAt: new Date() });
  await audit(db, actor, { action: `Invited parents and teachers: ${created} new logins, ${emailed} set-password emails${skipped ? `, ${skipped} skipped (email already used by someone else)` : ''}`, page: 'Setup', entity: 'login_identity' });
  return { created, emailed, skipped };
}

export const pendingInvites = async (db: DbOrTx) => (await db.select({ n: sql<number>`count(*)::int` }).from(loginIdentity)
  .where(and(inArray(loginIdentity.portal, ['parent', 'teacher']), isNull(loginIdentity.passwordHash))))[0]!.n;
