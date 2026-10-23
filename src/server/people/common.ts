import { z } from 'zod';
import { formatInstant } from '@/lib/dates';
import type { AuditActor } from '../audit';

export type Actor = AuditActor & { identityId: number };

/** Thrown inside a transaction to roll it back and report field errors to the form. */
export class FieldFail extends Error { constructor(public errors: Record<string, string>) { super('field'); } }
export const catchFieldFail = (e: unknown) => { if (e instanceof FieldFail) return { ok: false as const, errors: e.errors }; throw e; };

/** Today's calendar date in the school's timezone, as YYYY-MM-DD. */
export const todayIso = (now = new Date()) => formatInstant(now, 'yyyy-MM-dd');

/** Whole years between a date of birth and a calendar date (both YYYY-MM-DD). */
export function ageOn(dob: string | null, on: string): number | null {
  if (!dob) return null;
  const [by, bm, bd] = dob.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const LEFT_STATUSES = ['Relocated/Left', 'Finished', 'Expelled', 'Deceased', 'Rejected'] as const;
export const isLeftStatus = (s: string) => (LEFT_STATUSES as readonly string[]).includes(s);

export const idList = z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one').max(2000);

export const optEmail = z.union([z.literal(''), z.email('Enter a valid email address').max(200)]).optional().transform((v) => (v ? v.toLowerCase() : null));
