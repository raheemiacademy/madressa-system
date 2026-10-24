import { parsePounds } from './money';

/** Pure fee maths. Amounts are integer pence; percentages are basis points (1250 = 12.5%). Dates are YYYY-MM-DD. */

export type IntervalUnit = 'days' | 'weeks' | 'months';
export type DueRule = 'start' | 'end' | '2' | '3' | '5' | '7' | '14' | '21';
export type Adjustment = { kind: string; amount: number; unit: string };
export type PeriodLike = { startsOn: string; endsOn: string; invoiceCount: number; intervalCount: number; intervalUnit: IntervalUnit; startWeekday: number | null; dueRule: string };
export type Scheduled = { index: number; invoiceDate: string; from: string; to: string; due: string };

const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const plusDays = (iso: string, n: number) => fromMs(toMs(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);

/** Adds whole months, keeping the day of month where it exists (31 Jan + 1 month = 28/29 Feb). */
export function plusMonths(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export const plusInterval = (iso: string, count: number, unit: IntervalUnit) =>
  unit === 'months' ? plusMonths(iso, count) : plusDays(iso, count * (unit === 'weeks' ? 7 : 1));

/** The first date on or after `iso` that falls on `weekday` (0 = Sunday). */
export function onOrAfterWeekday(iso: string, weekday: number) {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return plusDays(iso, (weekday - wd + 7) % 7);
}

/** Every invoice a fee period issues: invoice date, the period it covers, and its due date. */
export function schedule(p: PeriodLike): Scheduled[] {
  const issues = Array.from({ length: p.invoiceCount }, (_, i) => plusInterval(p.startsOn, i * p.intervalCount, p.intervalUnit));
  const froms = issues.map((d) => (p.startWeekday === null ? d : onOrAfterWeekday(d, p.startWeekday)));
  return issues.map((invoiceDate, i) => {
    const from = froms[i]!;
    const next = froms[i + 1];
    const end = next ? plusDays(next, -1) : p.endsOn;
    const to = end < from ? from : end;
    const due = p.dueRule === 'start' ? from : p.dueRule === 'end' ? to : plusDays(from, Number(p.dueRule) - 1);
    return { index: i, invoiceDate, from, to, due };
  });
}

/** Problems with a period's dates, or null. Every invoice must be issued inside the period. */
export function periodProblem(p: PeriodLike): string | null {
  if (p.endsOn < p.startsOn) return 'The end date can’t be before the start';
  const last = plusInterval(p.startsOn, (p.invoiceCount - 1) * p.intervalCount, p.intervalUnit);
  if (last > p.endsOn) return `${p.invoiceCount} invoices at this interval run past the end date (the last would be issued ${last})`;
  return null;
}

/** Applies a standing adjustment. Returns null when the student is free (no invoice at all). Never below £0. */
export function adjust(amount: number, a: Adjustment | null | undefined): number | null {
  if (!a) return amount;
  if (a.kind === 'free') return null;
  const delta = a.unit === 'percent' ? Math.round((amount * a.amount) / 10_000) : a.amount;
  return Math.max(0, a.kind === 'add' ? amount + delta : amount - delta);
}

export type InvoiceStatus = 'Paid' | 'Overdue' | 'Balance';
/** §2: Paid, OVERDUE (past due with a balance), or Balance (still to pay, not yet due). Only cleared money counts as received. */
export const invoiceStatus = (amount: number, received: number, due: string, today: string): InvoiceStatus =>
  received >= amount ? 'Paid' : due < today ? 'Overdue' : 'Balance';

/** Splits a payment across invoices in the order given (oldest first). Returns the parts and anything left over. */
export function allocate(amount: number, invoices: { id: number; balance: number }[]) {
  const parts: { invoiceId: number; amount: number }[] = [];
  let left = amount;
  for (const inv of invoices) {
    if (left <= 0) break;
    if (inv.balance <= 0) continue;
    const take = Math.min(left, inv.balance);
    parts.push({ invoiceId: inv.id, amount: take });
    left -= take;
  }
  return { parts, left };
}

/** Structure editor helper: split a date range into n periods of (nearly) equal length. */
export function periodsEqually(start: string, end: string, n: number) {
  const total = daysBetween(start, end) + 1;
  return Array.from({ length: n }, (_, i) => ({
    startsOn: plusDays(start, Math.round((i * total) / n)),
    endsOn: plusDays(start, Math.round(((i + 1) * total) / n) - 1)
  }));
}

/** Structure editor helper: one period per calendar month, the first and last clipped to the range. */
export function periodsToMonthEnds(start: string, end: string) {
  const out: { startsOn: string; endsOn: string }[] = [];
  let from = start;
  while (from <= end && out.length < 60) {
    const [y, m] = from.split('-').map(Number) as [number, number];
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push({ startsOn: from, endsOn: monthEnd < end ? monthEnd : end });
    from = plusDays(monthEnd, 1);
  }
  return out;
}

/** "10%" → { amount: 1000, unit: 'percent' }; "£5" or "5" → pence. Null if it isn't a plain amount. */
export function parseAdjustmentAmount(input: string, unit: 'pence' | 'percent') {
  if (unit === 'pence') return parsePounds(input);
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(input.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
}

export const formatBps = (bps: number) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2).replace(/0$/, '')}%`;
