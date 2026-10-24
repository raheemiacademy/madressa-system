import { and, eq, inArray, isNull, lte, or, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { academicYear, classAssignment, contribution, feeAdjustment, feeStructure, invoice, schoolClass, student, studentContact } from '@/db/schema';
import { adjust, schedule, type IntervalUnit } from '@/lib/fees';
import { formatPence } from '@/lib/money';
import { isoDate, zodErrors } from '@/lib/validate';
import { audit, type AuditActor } from '../audit';
import { readTab } from '../settings';
import { todayIso, type Actor } from '../people/common';
import { pounds } from './invoices';
import { periodsOf, structureByClass } from './structures';

type NewInvoice = typeof invoice.$inferInsert & { generationKey: string };
export type GenerateResult = { created: number; restored: number; skipped: number };

/**
 * Writes generated invoices idempotently: a key that already exists is never inserted again.
 * With `restore`, keys whose invoice was deleted are brought back (Force Generate).
 */
async function writeGenerated(tx: DbOrTx, rows: NewInvoice[], restore: boolean): Promise<GenerateResult> {
  if (!rows.length) return { created: 0, restored: 0, skipped: 0 };
  const keys = rows.map((r) => r.generationKey);
  const existing = new Map<string, boolean>();
  for (let i = 0; i < keys.length; i += 5000) {
    for (const r of await tx.select({ key: invoice.generationKey, deletedAt: invoice.deletedAt }).from(invoice).where(inArray(invoice.generationKey, keys.slice(i, i + 5000)))) existing.set(r.key!, !!r.deletedAt);
  }
  const fresh = rows.filter((r) => !existing.has(r.generationKey));
  let created = 0;
  for (let i = 0; i < fresh.length; i += 1000) created += (await tx.insert(invoice).values(fresh.slice(i, i + 1000)).onConflictDoNothing({ target: invoice.generationKey }).returning({ id: invoice.id })).length;
  let restored = 0;
  if (restore) {
    for (const r of rows.filter((x) => existing.get(x.generationKey) === true)) {
      restored += (await tx.update(invoice).set({ deletedAt: null, amountPence: r.amountPence, invoiceDate: r.invoiceDate, dueDate: r.dueDate, periodFrom: r.periodFrom, periodTo: r.periodTo, updatedAt: new Date() })
        .where(and(eq(invoice.generationKey, r.generationKey), sql`${invoice.deletedAt} is not null`)).returning({ id: invoice.id })).length;
    }
  }
  return { created, restored, skipped: rows.length - created - restored };
}

const primaryContacts = async (db: DbOrTx, ids: number[]) => new Map(ids.length
  ? (await db.select({ s: studentContact.studentId, c: studentContact.contactId }).from(studentContact).where(and(inArray(studentContact.studentId, ids), eq(studentContact.isPrimary, true)))).map((r) => [r.s, r.c])
  : []);
const adjustments = async (db: DbOrTx, ids: number[]) => new Map(ids.length ? (await db.select().from(feeAdjustment).where(inArray(feeAdjustment.studentId, ids))).map((a) => [a.studentId, a]) : []);

export const generateInput = z.object({
  scope: z.enum(['today', 'year']).default('today'),
  activeOnly: z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on')
});

/**
 * §2 Generate missing invoices: every class's structure (its own or the year's default) bills the students in that class
 * on each invoice's period start. `today` stops at invoices dated up to today; `year` creates the whole year now.
 * Re-running never duplicates: each invoice is keyed on period, invoice number and student.
 */
export async function generateInvoices(db: Db, actor: Actor, yearId: number, raw: unknown, opts: { force?: boolean; today?: string } = {}): Promise<{ ok: true; result: GenerateResult } | { ok: false; error: string }> {
  const p = generateInput.safeParse(raw);
  if (!p.success) return { ok: false, error: 'Check the options' };
  const { scope, activeOnly } = p.data;
  const today = opts.today ?? todayIso();
  return db.transaction(async (tx) => {
    const [year] = await tx.select().from(academicYear).where(eq(academicYear.id, yearId)).limit(1);
    if (!year) return { ok: false as const, error: 'Choose an academic year' };
    const byClass = await structureByClass(tx, yearId);
    const structureIds = [...new Set([...byClass.values()].map((c) => c.structure?.id).filter((x): x is number => !!x))];
    const periods = await periodsOf(tx, structureIds);
    const classIds = [...byClass.keys()];
    const members = classIds.length ? await tx.select({ studentId: classAssignment.studentId, classId: classAssignment.classId, fromDate: classAssignment.fromDate, toDate: classAssignment.toDate, status: student.status })
      .from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId)).where(inArray(classAssignment.classId, classIds)) : [];
    const ids = [...new Set(members.map((m) => m.studentId))];
    const [adj, primary] = await Promise.all([adjustments(tx, ids), primaryContacts(tx, ids)]);
    const names = new Map((structureIds.length ? await tx.select({ id: feeStructure.id, name: feeStructure.name }).from(feeStructure).where(inArray(feeStructure.id, structureIds)) : []).map((s) => [s.id, s.name]));
    const rows: NewInvoice[] = [];
    for (const [classId, { structure }] of byClass) {
      if (!structure) continue;
      for (const per of periods.filter((x) => x.structureId === structure.id)) {
        for (const s of schedule({ ...per, intervalUnit: per.intervalUnit as IntervalUnit })) {
          if (scope === 'today' && s.invoiceDate > today) continue;
          for (const m of members) {
            if (m.classId !== classId || m.fromDate > s.from || (m.toDate && m.toDate < s.from) || (activeOnly && m.status !== 'Current')) continue;
            const amount = adjust(per.amountPence, adj.get(m.studentId));
            if (amount === null) continue;
            rows.push({
              type: 'Fees', studentId: m.studentId, academicYearId: yearId, billingContactId: primary.get(m.studentId) ?? null,
              invoiceDate: s.invoiceDate, periodFrom: s.from, periodTo: s.to, dueDate: s.due < s.invoiceDate ? s.invoiceDate : s.due,
              amountPence: amount, description: `${names.get(structure.id)}: ${per.name}${per.invoiceCount > 1 ? ` (${s.index + 1} of ${per.invoiceCount})` : ''}`,
              generationKey: `p${per.id}-${s.index}-s${m.studentId}`, periodId: per.id, createdBy: actor.identityId
            });
          }
        }
      }
    }
    // Two classes on the same structure would give the same key twice; keep one.
    const unique = [...new Map(rows.map((r) => [r.generationKey, r])).values()];
    const result = await writeGenerated(tx, unique, !!opts.force);
    await audit(tx, actor, {
      action: `${opts.force ? 'Force generated' : 'Generated'} invoices for ${year.title}: ${result.created} created${opts.force ? `, ${result.restored} restored` : ''}, ${result.skipped} already there`,
      page: 'Generate invoices', entity: 'invoice', details: { scope, activeOnly, force: !!opts.force }
    });
    return { ok: true as const, result };
  });
}

/** §2 "Create Ad Hoc Invoices": bills chosen students for every invoice of an ad hoc structure. */
export async function applyAdHoc(db: Db, actor: Actor, structureId: number, studentIds: number[]): Promise<{ ok: true; result: GenerateResult } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(feeStructure).where(and(eq(feeStructure.id, structureId), eq(feeStructure.isAdHoc, true))).limit(1);
    if (!s) return { ok: false as const, error: 'Choose an ad hoc structure' };
    const found = (await tx.select({ id: student.id }).from(student).where(inArray(student.id, studentIds.length ? studentIds : [0]))).map((r) => r.id);
    if (!found.length) return { ok: false as const, error: 'Choose a student' };
    const [periods, primary, adj] = await Promise.all([periodsOf(tx, [s.id]), primaryContacts(tx, found), adjustments(tx, found)]);
    const rows: NewInvoice[] = periods.flatMap((per) => schedule({ ...per, intervalUnit: per.intervalUnit as IntervalUnit }).flatMap((x) => found.flatMap((sid) => {
      const amount = adjust(per.amountPence, adj.get(sid));
      return amount === null ? [] : [{
        type: 'Fees' as const, studentId: sid, academicYearId: s.academicYearId, billingContactId: primary.get(sid) ?? null, invoiceDate: x.invoiceDate, periodFrom: x.from, periodTo: x.to,
        dueDate: x.due < x.invoiceDate ? x.invoiceDate : x.due, amountPence: amount, description: `${s.name}: ${per.name}${per.invoiceCount > 1 ? ` (${x.index + 1} of ${per.invoiceCount})` : ''}`,
        generationKey: `p${per.id}-${x.index}-s${sid}`, periodId: per.id, createdBy: actor.identityId
      }];
    })));
    const result = await writeGenerated(tx, rows, false);
    await audit(tx, actor, { action: `Applied ad hoc structure “${s.name}” to ${found.length === 1 ? '1 student' : `${found.length} students`}: ${result.created} invoices created`, page: 'Ad hoc invoices', entity: 'invoice', details: { studentIds: found } });
    return { ok: true as const, result };
  });
}

export const contributionInput = z.object({
  audience: z.enum(['active', 'waiting', 'classes', 'students']),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  studentIds: z.array(z.coerce.number().int().positive()).max(5000).default([]),
  invoiceDate: isoDate, dueDate: isoDate,
  description: z.string().trim().min(1, 'Describe the contribution').max(200),
  amount: pounds().refine((p) => p > 0, 'Enter an amount above £0')
}).refine((v) => v.dueDate >= v.invoiceDate, { path: ['dueDate'], message: 'The due date can’t be before the invoice date' })
  .refine((v) => v.audience !== 'classes' || v.classIds.length, { path: ['classIds'], message: 'Choose at least one class' })
  .refine((v) => v.audience !== 'students' || v.studentIds.length, { path: ['studentIds'], message: 'Choose at least one student' });

/** §2 Contributions: a one-off charge invoiced to the chosen students (keyed, so a student is never charged twice for it). */
export async function createContribution(db: Db, actor: Actor, yearId: number, raw: unknown): Promise<{ ok: true; id: number; n: number } | { ok: false; errors: Record<string, string> }> {
  const p = contributionInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const today = todayIso();
    const ids = v.audience === 'active' ? (await tx.select({ id: student.id }).from(student).where(eq(student.status, 'Current'))).map((r) => r.id)
      : v.audience === 'waiting' ? (await tx.select({ id: student.id }).from(student).where(eq(student.status, 'Waiting List'))).map((r) => r.id)
        : v.audience === 'classes' ? [...new Set((await tx.select({ id: classAssignment.studentId }).from(classAssignment).innerJoin(schoolClass, eq(schoolClass.id, classAssignment.classId))
          .where(and(inArray(classAssignment.classId, v.classIds), eq(schoolClass.academicYearId, yearId), lte(classAssignment.fromDate, today), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, today))))).map((r) => r.id))]
          : (await tx.select({ id: student.id }).from(student).where(inArray(student.id, v.studentIds))).map((r) => r.id);
    if (!ids.length) return { ok: false as const, errors: { audience: 'No students match this choice' } };
    const audience = v.audience === 'classes' ? `classes ${v.classIds.join(', ')}` : v.audience === 'students' ? `${ids.length} chosen students` : v.audience === 'active' ? 'all active students' : 'waiting list';
    const [c] = await tx.insert(contribution).values({ academicYearId: yearId, description: v.description, amountPence: v.amount, invoiceDate: v.invoiceDate, dueDate: v.dueDate, audience, createdBy: actor.identityId }).returning({ id: contribution.id });
    const primary = await primaryContacts(tx, ids);
    const result = await writeGenerated(tx, ids.map((sid) => ({
      type: 'Contribution' as const, studentId: sid, academicYearId: yearId, billingContactId: primary.get(sid) ?? null, invoiceDate: v.invoiceDate, dueDate: v.dueDate,
      amountPence: v.amount, description: v.description, generationKey: `c${c!.id}-s${sid}`, contributionId: c!.id, createdBy: actor.identityId
    })), false);
    await audit(tx, actor, { action: `Created contribution “${v.description}” (${formatPence(v.amount)}) for ${result.created === 1 ? '1 student' : `${result.created} students`}`, page: 'Contributions', entity: 'contribution', entityId: c!.id });
    return { ok: true as const, id: c!.id, n: result.created };
  });
}

/** Admission fee invoices (fees settings amount). One per student, ever. */
export async function createAdmissionFees(db: DbOrTx, actor: AuditActor, studentIds: number[], yearId: number): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const fee = Number((await readTab(db, 'fees')).admissionFee) || 0;
  if (fee <= 0) return { ok: false, error: 'Set the admission fee amount in Settings → Fees settings first.' };
  const today = todayIso();
  const primary = await primaryContacts(db, studentIds);
  const result = await writeGenerated(db, studentIds.map((sid) => ({
    type: 'Admission Fees' as const, studentId: sid, academicYearId: yearId, billingContactId: primary.get(sid) ?? null, invoiceDate: today, dueDate: today,
    amountPence: fee, description: 'Admission fee', generationKey: `adm-s${sid}`, createdBy: actor.identityId
  })), false);
  if (result.created) await audit(db, actor, { action: `Created ${result.created === 1 ? '1 admission fee invoice' : `${result.created} admission fee invoices`} (${formatPence(fee)} each)`, page: 'Admission fees', entity: 'invoice', details: { studentIds } });
  return { ok: true, n: result.created };
}
