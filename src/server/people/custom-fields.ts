import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, DbOrTx } from '@/db';
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, customField, customFieldValue } from '@/db/schema';
import { checkbox, isoDate, optionalText, zodErrors, type FieldErrors } from '@/lib/validate';
import { audit } from '../audit';
import type { Actor } from './common';

export type CustomFieldDef = typeof customField.$inferSelect;
export type Entity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const fieldInput = z.object({
  entity: z.enum(CUSTOM_FIELD_ENTITIES),
  label: z.string().trim().min(1, 'Add a label').max(60),
  question: optionalText(300),
  type: z.enum(CUSTOM_FIELD_TYPES),
  maxLength: z.union([z.literal(''), z.coerce.number().int().min(1).max(5000)]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  decimals: z.union([z.literal(''), z.coerce.number().int().min(0).max(6)]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
  options: z.string().max(4000).optional().transform((v) => (v ?? '').split('\n').map((x) => x.trim()).filter(Boolean)),
  searchable: checkbox,
  onRegistration: checkbox,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0)
}).refine((v) => !['radio', 'checkboxes'].includes(v.type) || v.options.length >= 2, { path: ['options'], message: 'Add at least two options, one per line' });

export const listFields = (db: DbOrTx, entity?: Entity) =>
  db.select().from(customField).where(entity ? eq(customField.entity, entity) : undefined).orderBy(asc(customField.sortOrder), asc(customField.id));

export async function saveField(db: Db, actor: Actor, raw: unknown, id?: number): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const p = fieldInput.safeParse(raw);
  if (!p.success) return { ok: false, errors: zodErrors(p.error) };
  await db.transaction(async (tx) => {
    const [row] = id ? await tx.update(customField).set(p.data).where(eq(customField.id, id)).returning() : await tx.insert(customField).values(p.data).returning();
    await audit(tx, actor, { action: `${id ? 'Updated' : 'Added'} custom field ${row!.label}`, page: 'Custom fields', entity: 'custom_field', entityId: row!.id });
  });
  return { ok: true };
}

export async function deleteField(db: Db, actor: Actor, id: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(customField).where(eq(customField.id, id)).returning();
    if (row) await audit(tx, actor, { action: `Deleted custom field ${row.label} and its answers`, page: 'Custom fields', entity: 'custom_field', entityId: id });
  });
}

/** Validates one submitted answer against its field definition. Returns the value to store, null for blank, or an error. */
export function parseAnswer(f: CustomFieldDef, raw: string | string[] | undefined): { value: unknown } | { error: string } {
  if (f.type === 'checkboxes') {
    const vals = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((v) => f.options.includes(v));
    return { value: vals.length ? vals : null };
  }
  const s = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  if (!s) return { value: null };
  switch (f.type) {
    case 'text': case 'multiline':
      return s.length > (f.maxLength ?? (f.type === 'text' ? 200 : 5000)) ? { error: `Use ${f.maxLength ?? (f.type === 'text' ? 200 : 5000)} characters or fewer` } : { value: s };
    case 'number': return /^-?\d{1,12}$/.test(s) ? { value: Number(s) } : { error: 'Enter a whole number' };
    case 'decimal': {
      const d = f.decimals ?? 2;
      return new RegExp(`^-?\\d{1,12}(\\.\\d{1,${d}})?$`).test(s) ? { value: s } : { error: `Enter a number with up to ${d} decimal places` };
    }
    case 'date': return isoDate.safeParse(s).success ? { value: s } : { error: 'Enter a real date' };
    case 'time': return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? { value: s } : { error: 'Enter a time such as 17:30' };
    case 'radio': return f.options.includes(s) ? { value: s } : { error: 'Choose one of the options' };
  }
}

/** Reads `cf.<id>` inputs from a form for the given fields. */
export function answersFromForm(fields: CustomFieldDef[], fd: FormData) {
  const values: Record<number, unknown> = {};
  const errors: FieldErrors = {};
  for (const f of fields) {
    const raw = f.type === 'checkboxes' ? fd.getAll(`cf.${f.id}`).map(String) : (fd.get(`cf.${f.id}`) as string | null) ?? undefined;
    const r = parseAnswer(f, raw);
    if ('error' in r) errors[`cf.${f.id}`] = r.error; else values[f.id] = r.value;
  }
  return { values, errors };
}

export async function saveAnswers(db: DbOrTx, ownerId: number, values: Record<number, unknown>) {
  const ids = Object.keys(values).map(Number);
  if (!ids.length) return;
  await db.delete(customFieldValue).where(and(eq(customFieldValue.ownerId, ownerId), inArray(customFieldValue.fieldId, ids)));
  const rows = ids.filter((id) => values[id] !== null).map((id) => ({ fieldId: id, ownerId, value: values[id] as object }));
  if (rows.length) await db.insert(customFieldValue).values(rows);
}

export async function answersFor(db: DbOrTx, entity: Entity, ownerId: number) {
  const fields = await listFields(db, entity);
  if (!fields.length) return { fields, values: {} as Record<number, unknown> };
  const rows = await db.select().from(customFieldValue).where(and(eq(customFieldValue.ownerId, ownerId), inArray(customFieldValue.fieldId, fields.map((f) => f.id))));
  return { fields, values: Object.fromEntries(rows.map((r) => [r.fieldId, r.value])) as Record<number, unknown> };
}

export const answerText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v));
