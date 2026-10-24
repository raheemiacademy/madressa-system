import { describe, expect, it } from 'vitest';
import { adjust, allocate, formatBps, invoiceStatus, parseAdjustmentAmount, periodProblem, periodsEqually, periodsToMonthEnds, plusMonths, schedule, type PeriodLike } from '@/lib/fees';

const period = (p: Partial<PeriodLike> = {}): PeriodLike => ({ startsOn: '2026-09-01', endsOn: '2027-07-31', invoiceCount: 10, intervalCount: 1, intervalUnit: 'months', startWeekday: null, dueRule: 'start', ...p });

describe('dates', () => {
  it('adds months without overflowing short months', () => {
    expect(plusMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(plusMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(plusMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(plusMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('schedule', () => {
  it('issues monthly invoices that cover back-to-back periods ending on the period end', () => {
    const s = schedule(period());
    expect(s).toHaveLength(10);
    expect(s[0]).toEqual({ index: 0, invoiceDate: '2026-09-01', from: '2026-09-01', to: '2026-09-30', due: '2026-09-01' });
    expect(s[9]).toMatchObject({ invoiceDate: '2027-06-01', from: '2027-06-01', to: '2027-07-31' });
  });

  it('starts each period on the chosen weekday and applies the due rule', () => {
    // 1 Sep 2026 is a Tuesday; the first Saturday on or after it is 5 Sep.
    const s = schedule(period({ invoiceCount: 2, intervalCount: 4, intervalUnit: 'weeks', startWeekday: 6, dueRule: '7', endsOn: '2026-10-31' }));
    expect(s[0]).toMatchObject({ invoiceDate: '2026-09-01', from: '2026-09-05', to: '2026-10-02', due: '2026-09-11' });
    expect(s[1]).toMatchObject({ invoiceDate: '2026-09-29', from: '2026-10-03', to: '2026-10-31' });
    expect(schedule(period({ invoiceCount: 1, dueRule: 'end' }))[0]!.due).toBe('2027-07-31');
  });

  it('rejects periods whose invoices would be issued after the end date', () => {
    expect(periodProblem(period())).toBeNull();
    expect(periodProblem(period({ invoiceCount: 12 }))).toMatch(/run past/);
    expect(periodProblem(period({ endsOn: '2026-08-01' }))).toMatch(/before the start/);
  });
});

describe('money', () => {
  it('adjusts by pence or percent, rounds half up, never goes below zero, and free means no invoice', () => {
    expect(adjust(3000, null)).toBe(3000);
    expect(adjust(3000, { kind: 'deduct', amount: 500, unit: 'pence' })).toBe(2500);
    expect(adjust(3000, { kind: 'add', amount: 1000, unit: 'percent' })).toBe(3300);
    expect(adjust(1005, { kind: 'deduct', amount: 5000, unit: 'percent' })).toBe(502); // 502.5 → 503 off, rounded half up
    expect(adjust(300, { kind: 'deduct', amount: 500, unit: 'pence' })).toBe(0);
    expect(adjust(3000, { kind: 'free', amount: 0, unit: 'pence' })).toBeNull();
  });

  it('only cleared money marks an invoice paid; overdue means past due with a balance', () => {
    expect(invoiceStatus(3000, 3000, '2026-09-01', '2026-10-01')).toBe('Paid');
    expect(invoiceStatus(3000, 2999, '2026-09-01', '2026-10-01')).toBe('Overdue');
    expect(invoiceStatus(3000, 0, '2026-10-01', '2026-10-01')).toBe('Balance');
    expect(invoiceStatus(0, 0, '2026-09-01', '2026-10-01')).toBe('Paid');
  });

  it('allocates a payment oldest first and reports the remainder', () => {
    expect(allocate(5000, [{ id: 1, balance: 3000 }, { id: 2, balance: 0 }, { id: 3, balance: 3000 }])).toEqual({ parts: [{ invoiceId: 1, amount: 3000 }, { invoiceId: 3, amount: 2000 }], left: 0 });
    expect(allocate(7000, [{ id: 1, balance: 3000 }, { id: 3, balance: 3000 }]).left).toBe(1000);
  });

  it('parses percentages as basis points', () => {
    expect(parseAdjustmentAmount('12.5%', 'percent')).toBe(1250);
    expect(parseAdjustmentAmount('100', 'percent')).toBe(10_000);
    expect(parseAdjustmentAmount('101', 'percent')).toBeNull();
    expect(parseAdjustmentAmount('£5.50', 'pence')).toBe(550);
    expect(formatBps(1250)).toBe('12.5%');
    expect(formatBps(1000)).toBe('10%');
  });
});

describe('structure helpers', () => {
  it('splits a range equally and to month ends without gaps', () => {
    const eq = periodsEqually('2026-09-01', '2027-08-31', 3);
    expect(eq.map((p) => [p.startsOn, p.endsOn])).toEqual([['2026-09-01', '2026-12-31'], ['2027-01-01', '2027-05-01'], ['2027-05-02', '2027-08-31']]);
    const me = periodsToMonthEnds('2026-09-15', '2026-12-10');
    expect(me).toEqual([{ startsOn: '2026-09-15', endsOn: '2026-09-30' }, { startsOn: '2026-10-01', endsOn: '2026-10-31' }, { startsOn: '2026-11-01', endsOn: '2026-11-30' }, { startsOn: '2026-12-01', endsOn: '2026-12-10' }]);
  });
});
