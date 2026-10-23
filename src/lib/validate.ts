import { z } from 'zod';

/** A real calendar date as YYYY-MM-DD (what <input type=date> submits). */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, 'Enter a real date');

// Blank or missing optional fields are stored as null.
export const optionalIsoDate = z.union([z.literal(''), isoDate]).optional().transform((v) => v || null);
export const optionalText = (max = 200) => z.string().trim().max(max).optional().transform((v) => v || null);
// Unticked checkboxes are simply absent from FormData.
export const checkbox = z.union([z.literal('on'), z.literal('')]).nullish().transform((v) => v === 'on');

export type FieldErrors = Record<string, string>;
export type FormState = { ok?: boolean; message?: string; errors?: FieldErrors } | undefined;

export function zodErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const i of err.issues) out[String(i.path[0] ?? '')] ??= i.message;
  return out;
}

/** FormData → plain object of first values (strings), for Zod. */
export const formObject = (fd: FormData) => Object.fromEntries([...fd.keys()].map((k) => [k, fd.get(k) instanceof File ? undefined : fd.get(k)]));
