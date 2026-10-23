import { describe, expect, it } from 'vitest';
import { inRange, monthGrid, monthsBetween } from '@/lib/calendar';
import { formatCalendarDate, formatInstant, greeting } from '@/lib/dates';
import { formatPence, parsePounds, penceToInput } from '@/lib/money';
import { safeNext } from '@/lib/safe-next';
import { initials, plural } from '@/lib/text';
import { adminCan } from '@/server/permissions';

describe('money (integer pence)', () => {
  it.each([
    ['45', 4500], ['45.5', 4550], ['45.50', 4550], ['0.50', 50], ['0.05', 5], ['£1,234.56', 123456], ['12,345,678', 1234567800], ['  7 ', 700]
  ])('parses %s', (s, p) => expect(parsePounds(s)).toBe(p));

  it.each(['', '-5', '1.234', 'abc', '1,23', '1e3', '£', '0x10'])('rejects %s', (s) => expect(parsePounds(s)).toBeNull());

  it('never drifts through floats', () => {
    expect(parsePounds('0.10')! + parsePounds('0.20')!).toBe(30);
    expect(parsePounds('19.99')).toBe(1999);
  });

  it('shows pence only when non-zero', () => {
    expect(formatPence(4500)).toBe('£45');
    expect(formatPence(50)).toBe('£0.50');
    expect(formatPence(123450)).toBe('£1,234.50');
    expect(formatPence(0)).toBe('£0');
    expect(formatPence(-1999)).toBe('−£19.99');
  });

  it('round-trips to form inputs', () => {
    expect(penceToInput(4500)).toBe('45');
    expect(penceToInput(4550)).toBe('45.50');
    expect(parsePounds(penceToInput(1999))).toBe(1999);
  });
});

describe('text', () => {
  it('builds initials from first and last word, skipping honorifics', () => {
    expect(initials('Ustadha Maryam Ali')).toBe('MA');
    expect(initials('Test Parent A')).toBe('TA');
    expect(initials('single')).toBe('S');
    expect(initials('  ')).toBe('·');
    expect(initials('Ömer Çelik')).toBe('ÖÇ');
  });
  it('uses singular and plural wording', () => {
    expect(plural(1, 'invoice')).toBe('1 invoice');
    expect(plural(0, 'invoice')).toBe('0 invoices');
    expect(plural(1200, 'staff member')).toBe('1,200 staff members');
  });
});

describe('dates in Europe/London', () => {
  it('shows instants in UK time across BST', () => {
    expect(formatInstant(new Date('2026-07-01T23:30:00Z'), 'dd/MM/yyyy HH:mm')).toBe('02/07/2026 00:30');
    expect(formatInstant(new Date('2026-12-01T23:30:00Z'), 'dd/MM/yyyy HH:mm')).toBe('01/12/2026 23:30');
  });
  it('never shifts calendar dates', () => expect(formatCalendarDate('2026-03-29')).toBe('29/03/2026'));
  it('greets by UK hour', () => {
    expect(greeting(new Date('2026-07-01T10:30:00Z'))).toBe('Good morning'); // 11:30 BST
    expect(greeting(new Date('2026-07-01T11:30:00Z'))).toBe('Good afternoon'); // 12:30 BST
    expect(greeting(new Date('2026-12-01T17:30:00Z'))).toBe('Good evening');
  });
});

describe('calendar grid', () => {
  it('starts weeks on Monday', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(g.flat().filter(Boolean)).toHaveLength(31);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it('lists months across a year boundary', () => {
    expect(monthsBetween('2026-09-01', '2027-07-31')).toHaveLength(11);
    expect(inRange('2026-10-26', '2026-10-26', '2026-10-30')).toBe(true);
  });
});

describe('login redirect target', () => {
  it.each([
    ['/admin/settings', '/admin/settings'], ['/admin', '/admin'], ['/admin?x=1', '/admin?x=1'],
    ['https://evil.example', '/admin'], ['//evil.example', '/admin'], ['/admin\\@evil', '/admin'], ['/teacher', '/admin'],
    ['/administrator', '/admin'], ['/admin/login', '/admin'], [undefined, '/admin']
  ])('%s → %s', (n, out) => expect(safeNext('admin', n)).toBe(out));
});

describe('admin access levels (§3)', () => {
  const none = { isSuper: false, canEdit: false, canDelete: false, feesAccess: false, marketing: false, sendSms: false };
  it('super can do everything', () => {
    for (const p of ['view', 'edit', 'delete', 'fees', 'marketing', 'sms', 'super'] as const) expect(adminCan({ ...none, isSuper: true }, p)).toBe(true);
  });
  it('each flag grants only its own permission', () => {
    expect(adminCan(none, 'view')).toBe(true);
    expect(adminCan(none, 'edit')).toBe(false);
    expect(adminCan({ ...none, canEdit: true }, 'delete')).toBe(false);
    expect(adminCan({ ...none, canDelete: true }, 'delete')).toBe(true);
    expect(adminCan({ ...none, feesAccess: true }, 'fees')).toBe(true);
    expect(adminCan({ ...none, marketing: true }, 'sms')).toBe(false);
    expect(adminCan({ ...none, sendSms: true }, 'sms')).toBe(true);
    expect(adminCan({ ...none, canEdit: true, canDelete: true, feesAccess: true, marketing: true, sendSms: true }, 'super')).toBe(false);
  });
});

describe('encryption key format', async () => {
  const { parseKey } = await import('@/server/crypto');
  it('accepts 32 bytes as hex or base64 and nothing else', () => {
    expect(parseKey('ab'.repeat(32))).toHaveLength(32);
    expect(parseKey(Buffer.alloc(32, 7).toString('base64'))).toHaveLength(32);
    expect(() => parseKey('ab'.repeat(16))).toThrow();
    expect(() => parseKey(Buffer.alloc(16).toString('base64'))).toThrow();
    expect(() => parseKey('')).toThrow();
  });
});
