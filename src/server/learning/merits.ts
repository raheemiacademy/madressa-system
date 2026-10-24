import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { achievement, BADGES, certificate, certificateTemplate, classAssignment, fileObject, merit, meritAward, meritTeam, productSale, schoolClass, student, studentContact, contact, teacher, teamCompetition } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { isoDate, optionalText, zodErrors } from '@/lib/validate';
import { audit } from '../audit';
import { todayIso, type Actor } from '../people/common';
import { readStored } from '../storage';

const checkbox = z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on');

/* ───────── Merits ───────── */

export const meritInput = z.object({
  name: z.string().trim().min(1, 'Name the merit').max(80), description: optionalText(300),
  points: z.coerce.number().int().min(-100, 'Between −100 and 100').max(100, 'Between −100 and 100').refine((n) => n !== 0, 'Use a number other than 0'),
  forStudents: checkbox, forTeachers: checkbox, enabled: checkbox, official: checkbox
}).refine((v) => v.forStudents || v.forTeachers, { path: ['forStudents'], message: 'Choose students, teachers or both' });

export const listMerits = (db: DbOrTx) => db.select().from(merit).orderBy(desc(merit.enabled), asc(merit.name));

export async function saveMerit(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = meritInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(merit).set(p.data).where(eq(merit.id, id)).returning() : await db.insert(merit).values(p.data).returning();
  await audit(db, actor, { action: `Saved merit “${p.data.name}” (${p.data.points} points)`, page: 'Merits', entity: 'merit', entityId: row?.id });
  return { ok: true as const };
}

export const awardInput = z.object({
  meritId: z.coerce.number().int().positive('Choose a merit'),
  studentIds: z.array(z.coerce.number().int().positive()).max(2000).default([]),
  teacherIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  awardedOn: isoDate, comment: optionalText(300)
}).refine((v) => v.studentIds.length || v.teacherIds.length, { path: ['studentIds'], message: 'Choose who gets it' })
  .refine((v) => v.awardedOn <= todayIso(), { path: ['awardedOn'], message: 'The date can’t be in the future' });

/** §18 "Award Merits Now": one award per person. A student's class is recorded as the class they're in that day. */
export async function awardMerits(db: Db, actor: Actor, raw: unknown) {
  const p = awardInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const v = p.data;
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(merit).where(and(eq(merit.id, v.meritId), eq(merit.enabled, true)));
    if (!m) return { ok: false as const, errors: { meritId: 'Choose an enabled merit' } };
    if (v.studentIds.length && !m.forStudents) return { ok: false as const, errors: { meritId: 'This merit isn’t for students' } };
    if (v.teacherIds.length && !m.forTeachers) return { ok: false as const, errors: { meritId: 'This merit isn’t for teachers' } };
    const classOf = v.studentIds.length ? await tx.select({ s: classAssignment.studentId, c: classAssignment.classId }).from(classAssignment)
      .where(and(inArray(classAssignment.studentId, v.studentIds), lte(classAssignment.fromDate, v.awardedOn), or(isNull(classAssignment.toDate), gte(classAssignment.toDate, v.awardedOn)))) : [];
    const rows = [
      ...v.studentIds.map((sid) => ({ meritId: m.id, studentId: sid, classId: classOf.find((x) => x.s === sid)?.c ?? null, points: m.points, comment: v.comment, awardedOn: v.awardedOn, awardedBy: actor.name })),
      ...v.teacherIds.map((tid) => ({ meritId: m.id, teacherId: tid, points: m.points, comment: v.comment, awardedOn: v.awardedOn, awardedBy: actor.name }))
    ];
    await tx.insert(meritAward).values(rows);
    await audit(tx, actor, { action: `Awarded “${m.name}” to ${rows.length === 1 ? '1 person' : `${rows.length} people`}`, page: 'Merits', entity: 'merit_award', details: { studentIds: v.studentIds, teacherIds: v.teacherIds } });
    return { ok: true as const, n: rows.length };
  });
}

export type AwardFilter = { classId?: number; teacherId?: number; meritId?: number; from?: string; to?: string; studentId?: number };
export function listAwards(db: DbOrTx, f: AwardFilter = {}) {
  const conds: (SQL | undefined)[] = [f.classId ? eq(meritAward.classId, f.classId) : undefined, f.teacherId ? eq(meritAward.teacherId, f.teacherId) : undefined, f.meritId ? eq(meritAward.meritId, f.meritId) : undefined,
    f.from ? gte(meritAward.awardedOn, f.from) : undefined, f.to ? lte(meritAward.awardedOn, f.to) : undefined, f.studentId ? eq(meritAward.studentId, f.studentId) : undefined];
  return db.select({ a: meritAward, meritName: merit.name, to: sql<string>`coalesce(${student.firstName} || ' ' || ${student.surname}, ${teacher.name})`, className: schoolClass.name })
    .from(meritAward).innerJoin(merit, eq(merit.id, meritAward.meritId)).leftJoin(student, eq(student.id, meritAward.studentId)).leftJoin(teacher, eq(teacher.id, meritAward.teacherId)).leftJoin(schoolClass, eq(schoolClass.id, meritAward.classId))
    .where(and(...conds)).orderBy(desc(meritAward.awardedOn), desc(meritAward.id)).limit(1000);
}

export async function deleteAwards(db: Db, actor: Actor, ids: number[]) {
  if (!ids.length) return 0;
  const gone = await db.delete(meritAward).where(inArray(meritAward.id, ids)).returning({ id: meritAward.id });
  await audit(db, actor, { action: `Deleted ${gone.length === 1 ? '1 merit award' : `${gone.length} merit awards`}`, page: 'Merits', entity: 'merit_award', details: { ids } });
  return gone.length;
}

/** Totals per student: points earned, merits spent in the shop, and what's left to spend. */
export async function studentTotals(db: DbOrTx, studentIds?: number[]) {
  const earned = await db.select({ id: meritAward.studentId, points: sql<number>`sum(${meritAward.points})`.mapWith(Number), count: sql<number>`count(*)`.mapWith(Number) }).from(meritAward)
    .where(and(sql`${meritAward.studentId} is not null`, studentIds ? inArray(meritAward.studentId, studentIds.length ? studentIds : [0]) : undefined)).groupBy(meritAward.studentId);
  const spent = await db.select({ id: productSale.studentId, n: sql<number>`sum(${productSale.meritsSpent})`.mapWith(Number) }).from(productSale)
    .where(and(sql`${productSale.studentId} is not null`, studentIds ? inArray(productSale.studentId, studentIds.length ? studentIds : [0]) : undefined)).groupBy(productSale.studentId);
  const ids = [...new Set([...earned.map((e) => e.id!), ...spent.map((s) => s.id!)])];
  const names = ids.length ? await db.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).where(inArray(student.id, ids)) : [];
  return names.map((n) => {
    const e = earned.find((x) => x.id === n.id), s = spent.find((x) => x.id === n.id);
    return { id: n.id, name: `${n.firstName} ${n.surname}`, points: e?.points ?? 0, awards: e?.count ?? 0, spent: s?.n ?? 0, balance: (e?.points ?? 0) - (s?.n ?? 0) };
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/* ───────── Achievements and certificates ───────── */

export const achievementInput = z.object({
  name: z.string().trim().min(1, 'Name it').max(80), sanction: checkbox,
  meritId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  target: z.coerce.number().int().min(1, 'At least 1').max(100_000),
  badge: z.enum(BADGES),
  certificateTemplateId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  forStudents: checkbox, forTeachers: checkbox, enabled: checkbox
});
export const listAchievements = (db: DbOrTx) => db.select({ a: achievement, meritName: merit.name }).from(achievement).leftJoin(merit, eq(merit.id, achievement.meritId)).orderBy(asc(achievement.name));
export async function saveAchievement(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = achievementInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(achievement).set(p.data).where(eq(achievement.id, id)).returning() : await db.insert(achievement).values(p.data).returning();
  await audit(db, actor, { action: `Saved ${p.data.sanction ? 'sanction' : 'achievement'} “${p.data.name}”`, page: 'Achievements', entity: 'achievement', entityId: row?.id });
  return { ok: true as const };
}

/** Students who have reached an achievement (that many of its merit, or that many points) but haven't been given its certificate yet. */
export async function reached(db: DbOrTx, achievementId: number) {
  const [a] = await db.select().from(achievement).where(eq(achievement.id, achievementId));
  if (!a || !a.forStudents) return [];
  const value = a.meritId ? sql<number>`count(*)` : sql<number>`sum(${meritAward.points})`;
  const rows = await db.select({ id: meritAward.studentId, v: value.mapWith(Number) }).from(meritAward)
    .where(and(sql`${meritAward.studentId} is not null`, a.meritId ? eq(meritAward.meritId, a.meritId) : undefined)).groupBy(meritAward.studentId);
  const hit = rows.filter((r) => (a.sanction ? Math.abs(r.v) : r.v) >= a.target).map((r) => r.id!);
  if (!hit.length) return [];
  const done = new Set((await db.select({ s: certificate.studentId }).from(certificate).where(and(eq(certificate.achievementId, a.id), inArray(certificate.studentId, hit)))).map((r) => r.s));
  return db.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).where(inArray(student.id, hit.filter((x) => !done.has(x)).concat(0))).orderBy(asc(student.surname));
}

const LAYOUT = z.object({ x: z.coerce.number().min(0).max(300), y: z.coerce.number().min(0).max(300), size: z.coerce.number().min(6).max(72) });
export const templateInput = z.object({
  name: z.string().trim().min(1, 'Name the template').max(80), size: z.enum(['A4', 'A5', 'A6']), orientation: z.enum(['portrait', 'landscape']),
  layout: z.object({ name: LAYOUT, achievement: LAYOUT, badge: LAYOUT, address: LAYOUT, date: LAYOUT })
});
/** Default positions (mm from the bottom-left) for a landscape A4 certificate; other sizes scale. */
export const DEFAULT_LAYOUT = { name: { x: 148, y: 120, size: 32 }, achievement: { x: 148, y: 95, size: 18 }, badge: { x: 148, y: 50, size: 14 }, address: { x: 20, y: 15, size: 9 }, date: { x: 260, y: 15, size: 10 } };
export const listCertificateTemplates = (db: DbOrTx) => db.select().from(certificateTemplate).orderBy(asc(certificateTemplate.name));
export async function saveCertificateTemplate(db: Db, actor: Actor, raw: unknown, fileId: string | null | undefined, id?: number) {
  const p = templateInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const values = { ...p.data, ...(fileId !== undefined ? { fileId } : {}) };
  const [row] = id ? await db.update(certificateTemplate).set(values).where(eq(certificateTemplate.id, id)).returning() : await db.insert(certificateTemplate).values(values).returning();
  await audit(db, actor, { action: `Saved certificate template “${p.data.name}”`, page: 'Certificates', entity: 'certificate_template', entityId: row?.id });
  return { ok: true as const, id: row!.id };
}

export const issueInput = z.object({
  studentIds: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one student').max(500),
  templateId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  achievementId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v ? v : null)),
  badge: z.enum(BADGES), forText: z.string().trim().min(1, 'Say what it’s for').max(200), issuedOn: isoDate, onPortal: checkbox
});
export async function issueCertificates(db: Db, actor: Actor, raw: unknown) {
  const p = issueInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const { studentIds, ...v } = p.data;
  const rows = await db.insert(certificate).values(studentIds.map((studentId) => ({ ...v, studentId, issuedBy: actor.name }))).returning({ id: certificate.id });
  await audit(db, actor, { action: `Issued ${rows.length === 1 ? '1 certificate' : `${rows.length} certificates`} “${v.forText}”`, page: 'Certificates', entity: 'certificate', details: { studentIds } });
  return { ok: true as const, ids: rows.map((r) => r.id) };
}

export const listCertificates = (db: DbOrTx, studentId?: number) => db.select({ c: certificate, firstName: student.firstName, surname: student.surname, templateName: certificateTemplate.name })
  .from(certificate).innerJoin(student, eq(student.id, certificate.studentId)).leftJoin(certificateTemplate, eq(certificateTemplate.id, certificate.templateId))
  .where(studentId ? eq(certificate.studentId, studentId) : undefined).orderBy(desc(certificate.issuedOn), desc(certificate.id)).limit(500);

const SIZES = { A4: [210, 297], A5: [148, 210], A6: [105, 148] } as const;
const mm = (n: number) => (n * 72) / 25.4;
// Badge colours for the printed certificate (PDF needs literal RGB values).
const BADGE_RGB = { bronze: rgb(0.69, 0.45, 0.2), silver: rgb(0.62, 0.65, 0.7), gold: rgb(0.83, 0.66, 0.18) } as const;

/** Prints one certificate with pdf-lib: the template's uploaded PDF (or a blank page) with the name, achievement, badge, address and date placed on it. */
export async function certificatePdf(db: DbOrTx, certificateId: number) {
  const [row] = await db.select({ c: certificate, t: certificateTemplate, s: student, file: fileObject.storageKey }).from(certificate).innerJoin(student, eq(student.id, certificate.studentId))
    .leftJoin(certificateTemplate, eq(certificateTemplate.id, certificate.templateId)).leftJoin(fileObject, eq(fileObject.id, certificateTemplate.fileId)).where(eq(certificate.id, certificateId));
  if (!row) return null;
  const size = SIZES[(row.t?.size ?? 'A4') as keyof typeof SIZES];
  const [w, h] = (row.t?.orientation ?? 'landscape') === 'landscape' ? [size[1], size[0]] : [size[0], size[1]];
  const doc = row.file ? await PDFDocument.load(await readStored(row.file)) : await PDFDocument.create();
  const page = doc.getPageCount() ? doc.getPage(0) : doc.addPage([mm(w), mm(h)]);
  const [font, bold] = await Promise.all([doc.embedFont(StandardFonts.TimesRoman), doc.embedFont(StandardFonts.TimesRomanBold)]);
  // Positions were designed for A4 landscape; scale them to this page.
  const sx = page.getWidth() / mm(297), sy = page.getHeight() / mm(210);
  const L = row.t?.layout ?? DEFAULT_LAYOUT;
  const centred = (text: string, at: { x: number; y: number; size: number }, f = font) => {
    const size2 = at.size * Math.min(sx, sy);
    page.drawText(text, { x: mm(at.x) * sx - f.widthOfTextAtSize(text, size2) / 2, y: mm(at.y) * sy, size: size2, font: f, color: rgb(0.12, 0.14, 0.25) });
  };
  if (!row.file) page.drawRectangle({ x: 18, y: 18, width: page.getWidth() - 36, height: page.getHeight() - 36, borderColor: rgb(0.24, 0.36, 0.75), borderWidth: 3 });
  centred(`${row.s.firstName} ${row.s.surname}`, L.name, bold);
  centred(row.c.forText, L.achievement);
  if (row.c.badge !== 'none') {
    const b = L.badge, r = mm(10) * Math.min(sx, sy);
    page.drawCircle({ x: mm(b.x) * sx, y: mm(b.y) * sy + r * 0.4, size: r, color: BADGE_RGB[row.c.badge as keyof typeof BADGE_RGB] });
    centred(`${row.c.badge[0]!.toUpperCase()}${row.c.badge.slice(1)}`, { ...b, y: b.y - 14 }, bold);
  }
  const contacts = await db.select({ address: contact.address, postcode: contact.postcode }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId))
    .where(and(eq(studentContact.studentId, row.s.id), eq(studentContact.isPrimary, true)));
  const address = [row.s.address ?? contacts[0]?.address, row.s.postcode ?? contacts[0]?.postcode].filter(Boolean).join(', ');
  if (address) page.drawText(address.replace(/\s*\n\s*/g, ', '), { x: mm(L.address.x) * sx, y: mm(L.address.y) * sy, size: L.address.size, font });
  centred(formatCalendarDate(row.c.issuedOn), L.date);
  return { bytes: await doc.save(), filename: `certificate-${row.s.firstName}-${row.s.surname}.pdf`.replace(/[^\w.-]+/g, '-') };
}

/* ───────── Teams (houses) ───────── */

export const teamInput = z.object({
  name: z.string().trim().min(1, 'Name the team').max(60), colour: z.enum(['lav', 'sky', 'blue', 'indigo', 'violet']),
  classIds: z.array(z.coerce.number().int().positive()).max(500).default([]), studentIds: z.array(z.coerce.number().int().positive()).max(5000).default([])
});
export const listTeams = (db: DbOrTx) => db.select().from(meritTeam).orderBy(asc(meritTeam.name));
export async function saveTeam(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = teamInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(meritTeam).set(p.data).where(eq(meritTeam.id, id)).returning() : await db.insert(meritTeam).values(p.data).returning();
  await audit(db, actor, { action: `Saved team “${p.data.name}”`, page: 'Teams', entity: 'merit_team', entityId: row?.id });
  return { ok: true as const };
}
export const competitionInput = z.object({ name: z.string().trim().min(1, 'Name the competition').max(80), startsOn: isoDate, endsOn: isoDate })
  .refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'It can’t end before it starts' });
export const listCompetitions = (db: DbOrTx) => db.select().from(teamCompetition).orderBy(desc(teamCompetition.startsOn));

/** A competition's standings: points awarded within its dates to each team's students (named members, or by the class the award was made in). */
export async function standings(db: DbOrTx, competitionId: number) {
  const [c] = await db.select().from(teamCompetition).where(eq(teamCompetition.id, competitionId));
  if (!c) return null;
  const [teams, awards] = await Promise.all([listTeams(db), db.select().from(meritAward).where(and(sql`${meritAward.studentId} is not null`, gte(meritAward.awardedOn, c.startsOn), lte(meritAward.awardedOn, c.endsOn)))]);
  return { competition: c, rows: teams.map((t) => ({ team: t, points: awards.filter((a) => t.studentIds.includes(a.studentId!) || (a.classId !== null && t.classIds.includes(a.classId))).reduce((s, a) => s + a.points, 0) })).sort((a, b) => b.points - a.points) };
}

export async function saveCompetition(db: Db, actor: Actor, raw: unknown, id?: number) {
  const p = competitionInput.safeParse(raw);
  if (!p.success) return { ok: false as const, errors: zodErrors(p.error) };
  const [row] = id ? await db.update(teamCompetition).set(p.data).where(eq(teamCompetition.id, id)).returning() : await db.insert(teamCompetition).values(p.data).returning();
  await audit(db, actor, { action: `Saved team competition “${p.data.name}”`, page: 'Teams', entity: 'team_competition', entityId: row?.id });
  return { ok: true as const };
}
