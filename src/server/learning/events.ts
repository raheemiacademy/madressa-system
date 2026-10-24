import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { classAssignment, event, eventConsent, eventOptIn, eventPrice, eventTimeslot, invoice, payment, student, studentContact } from '@/db/schema';
import { formatPence, parsePounds } from '@/lib/money';
import { isoDate, optionalIsoDate, optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';

const checkbox = z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on');
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time');

export const eventInput = z.object({
  name: z.string().trim().min(1, 'Name the event').max(120),
  date: isoDate, time: z.union([z.literal(''), hhmm]).optional().transform((v) => v || null),
  days: z.coerce.number().int().min(0).max(60).default(0), hours: z.coerce.number().int().min(0).max(23).default(0), minutes: z.coerce.number().int().min(0).max(59).default(0),
  optInDeadline: optionalIsoDate, paymentDeadline: optionalIsoDate,
  description: optionalText(5000), terms: optionalText(5000),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  autoInvoice: checkbox, active: checkbox,
  consents: z.array(z.object({ text: z.string().trim().min(1).max(300), required: z.boolean() })).max(30).default([]),
  prices: z.array(z.object({ description: z.string().trim().min(1).max(120), price: z.string(), required: z.boolean() })).max(30).default([]),
  slots: z.array(z.object({ date: isoDate, from: hhmm, to: hhmm })).max(500).default([])
}).refine((v) => !v.optInDeadline || v.optInDeadline <= v.date, { path: ['optInDeadline'], message: 'The opt-in deadline should be on or before the event' })
  .refine((v) => v.prices.every((p) => parsePounds(p.price) !== null), { path: ['prices'], message: 'Each price needs an amount like 5 or 2.50' })
  .refine((v) => v.slots.every((s) => s.to > s.from), { path: ['slots'], message: 'Each timeslot must end after it starts' });

/** "Timeslots: dates, from, to, interval": e.g. 10:00–12:00 every 20 minutes on each chosen date. */
export function makeSlots(dates: string[], from: string, to: string, interval: number) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const out: { date: string; from: string; to: string }[] = [];
  if (interval < 5) return out;
  for (const d of dates) for (let m = toMin(from); m + interval <= toMin(to) && out.length < 500; m += interval) out.push({ date: d, from: fmt(m), to: fmt(m + interval) });
  return out;
}

/** Saves an event with its consent items, itemised prices and timeslots (replaced as a set while nobody has opted in). */
export async function saveEvent(db: Db, actor: Actor, yearId: number, raw: unknown, id?: number) {
  const p = eventInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const { consents, prices, slots, days, hours, minutes, ...v } = p.data;
  return db.transaction(async (tx) => {
    const values = { ...v, durationMinutes: days * 1440 + hours * 60 + minutes };
    if (id) {
      const [taken] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(eventOptIn).where(eq(eventOptIn.eventId, id));
      const [cur] = await tx.update(event).set(values).where(eq(event.id, id)).returning();
      if (!cur) return { ok: false as const, errors: { name: 'This event no longer exists' } };
      if (taken?.n) {
        await audit(tx, actor, { action: `Updated event “${v.name}” (options kept: ${taken.n} already opted in)`, page: 'Events', entity: 'event', entityId: id });
        return { ok: true as const, id, kept: true };
      }
      await Promise.all([tx.delete(eventConsent).where(eq(eventConsent.eventId, id)), tx.delete(eventPrice).where(eq(eventPrice.eventId, id)), tx.delete(eventTimeslot).where(eq(eventTimeslot.eventId, id))]);
    }
    const eid = id ?? (await tx.insert(event).values({ ...values, academicYearId: yearId }).returning({ id: event.id }))[0]!.id;
    if (consents.length) await tx.insert(eventConsent).values(consents.map((c) => ({ ...c, eventId: eid })));
    if (prices.length) await tx.insert(eventPrice).values(prices.map((x) => ({ eventId: eid, description: x.description, pricePence: parsePounds(x.price)!, required: x.required })));
    if (slots.length) await tx.insert(eventTimeslot).values(slots.map((s) => ({ eventId: eid, date: s.date, fromTime: s.from, toTime: s.to })));
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} event “${v.name}”`, page: 'Events', entity: 'event', entityId: eid });
    return { ok: true as const, id: eid, kept: false };
  });
}

/** §8 list: upcoming (today or later) or previous events with price, timeslots and opt-ins. */
export async function listEvents(db: DbOrTx, when: 'upcoming' | 'previous') {
  const today = todayIso();
  return db.select({
    e: event,
    price: sql<number>`coalesce((select sum(p.price_pence) from event_price p where p.event_id = "event"."id" and p.required), 0)`.mapWith(Number),
    slots: sql<number>`(select count(*) from event_timeslot t where t.event_id = "event"."id")`.mapWith(Number),
    optIns: sql<number>`(select count(*) from event_opt_in o where o.event_id = "event"."id")`.mapWith(Number)
  }).from(event).where(when === 'upcoming' ? gte(event.date, today) : lt(event.date, today)).orderBy(when === 'upcoming' ? asc(event.date) : desc(event.date)).limit(300);
}

export async function getEvent(db: DbOrTx, id: number) {
  const [e] = await db.select().from(event).where(eq(event.id, id));
  if (!e) return null;
  const [consents, prices, slots, optIns] = await Promise.all([
    db.select().from(eventConsent).where(eq(eventConsent.eventId, id)).orderBy(asc(eventConsent.id)),
    db.select().from(eventPrice).where(eq(eventPrice.eventId, id)).orderBy(asc(eventPrice.id)),
    db.select().from(eventTimeslot).where(eq(eventTimeslot.eventId, id)).orderBy(asc(eventTimeslot.date), asc(eventTimeslot.fromTime)),
    db.select({ o: eventOptIn, firstName: student.firstName, surname: student.surname }).from(eventOptIn).innerJoin(student, eq(student.id, eventOptIn.studentId)).where(eq(eventOptIn.eventId, id)).orderBy(asc(student.surname))
  ]);
  return { event: e, consents, prices, slots, optIns };
}

export const optInInput = z.object({
  studentId: z.coerce.number().int().positive('Choose a student'),
  timeslotId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  consentIds: z.array(z.coerce.number().int().positive()).default([]),
  priceIds: z.array(z.coerce.number().int().positive()).default([])
});

/**
 * Opt a student in (staff on a parent's behalf now; parents from the portal in Phase 8). Required consents must be given;
 * required prices are always charged. With auto-invoice, a Contribution invoice is raised once per student and event.
 */
export async function recordOptIn(db: Db, actor: Actor, eventId: number, raw: unknown, source: 'admin' | 'portal' = 'admin') {
  const p = optInInput.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? 'Check the form' };
  const v = p.data;
  return db.transaction(async (tx) => {
    const e = await getEvent(tx, eventId);
    if (!e || !e.event.active) return { ok: false as const, error: 'This event isn’t open' };
    if (source === 'portal' && e.event.optInDeadline && todayIso() > e.event.optInDeadline) return { ok: false as const, error: 'The opt-in deadline has passed' };
    if (e.optIns.some((o) => o.o.studentId === v.studentId)) return { ok: false as const, error: 'This student has already opted in' };
    if (e.event.classIds.length) {
      const [inClass] = await tx.select({ id: classAssignment.id }).from(classAssignment).where(and(eq(classAssignment.studentId, v.studentId), inArray(classAssignment.classId, e.event.classIds))).limit(1);
      if (!inClass) return { ok: false as const, error: 'This event isn’t for this student’s class' };
    }
    const missing = e.consents.filter((c) => c.required && !v.consentIds.includes(c.id));
    if (missing.length) return { ok: false as const, error: `Required consent missing: ${missing.map((m) => m.text).join('; ')}` };
    if (e.slots.length && !e.slots.some((s) => s.id === v.timeslotId)) return { ok: false as const, error: 'Choose a timeslot' };
    const chosen = e.prices.filter((x) => x.required || v.priceIds.includes(x.id));
    const total = chosen.reduce((s, x) => s + x.pricePence, 0);
    const [primary] = await tx.select({ id: studentContact.contactId }).from(studentContact).where(and(eq(studentContact.studentId, v.studentId), eq(studentContact.isPrimary, true))).limit(1);
    let invoiceId: number | null = null;
    if (e.event.autoInvoice && total > 0) {
      const [inv] = await tx.insert(invoice).values({ type: 'Contribution', studentId: v.studentId, academicYearId: e.event.academicYearId, billingContactId: primary?.id ?? null,
        invoiceDate: todayIso(), dueDate: e.event.paymentDeadline ?? e.event.date, amountPence: total, description: `${e.event.name}: ${chosen.map((c) => c.description).join(', ')}`,
        generationKey: `ev${eventId}-s${v.studentId}`, createdBy: actor.identityId }).onConflictDoNothing({ target: invoice.generationKey }).returning({ id: invoice.id });
      invoiceId = inv?.id ?? null;
    }
    await tx.insert(eventOptIn).values({ eventId, studentId: v.studentId, contactId: primary?.id ?? null, timeslotId: v.timeslotId, consentIds: v.consentIds, priceIds: chosen.map((c) => c.id), totalPence: total, invoiceId, source });
    await audit(tx, actor, { action: `Opted a student into “${e.event.name}”${total ? ` (${formatPence(total)}${invoiceId ? ', invoiced' : ''})` : ''}`, page: 'Events', entity: 'event', entityId: eventId, details: { studentId: v.studentId } });
    return { ok: true as const, total, invoiced: !!invoiceId };
  });
}

/** Withdraws an opt-in. Its invoice is deleted too, unless money has been paid against it. */
export async function withdrawOptIn(db: Db, actor: Actor, eventId: number, studentId: number) {
  return db.transaction(async (tx) => {
    const [o] = await tx.delete(eventOptIn).where(and(eq(eventOptIn.eventId, eventId), eq(eventOptIn.studentId, studentId))).returning();
    if (!o) return { ok: false as const, error: 'Not opted in' };
    let kept = false;
    if (o.invoiceId) {
      const [paid] = await tx.select({ id: payment.id }).from(payment).where(eq(payment.invoiceId, o.invoiceId)).limit(1);
      if (paid) kept = true; else await tx.update(invoice).set({ deletedAt: new Date() }).where(eq(invoice.id, o.invoiceId));
    }
    await audit(tx, actor, { action: `Withdrew a student from event #${eventId}${kept ? ' (invoice kept: payments recorded)' : ''}`, page: 'Events', entity: 'event', entityId: eventId, details: { studentId } });
    return { ok: true as const, kept };
  });
}

export async function deleteEvent(db: Db, actor: Actor, id: number) {
  const [e] = await db.delete(event).where(eq(event.id, id)).returning();
  if (e) await audit(db, actor, { action: `Deleted event “${e.name}” (its invoices are kept)`, page: 'Events', entity: 'event', entityId: id });
}
