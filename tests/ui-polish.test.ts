import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, holiday, mailQueue } from '@/db/schema';
import { figureAt } from '@/lib/count-up';
import { friendlyDate } from '@/lib/dates';
import { holidaysBetween } from '@/server/holidays';
import { redeemPasswordLink, requestPasswordLink } from '@/server/password-links';
import { db, makeStaff, resetDb } from './helpers';

afterAll(() => sql.end());

describe('dashboard count-up', () => {
  it('keeps the prefix, suffix and decimals while counting', () => {
    expect(figureAt('£627.50', 0)).toBe('£0.00');
    expect(figureAt('93.8%', 0)).toBe('0.0%');
    expect(figureAt('1,284', 0.5)).toBe('1,124');
    expect(figureAt('£627.50', 1)).toBe('£627.50');
  });
  it('leaves text with no number alone', () => {
    expect(figureAt('—', 0.3)).toBe('—');
  });
});

describe('holidays on the attendance chart', () => {
  beforeEach(resetDb);
  it('lists whole-school holidays that overlap the range, and leaves out ones some classes attend', async () => {
    const [y] = await db.insert(academicYear).values({ title: '2026/27', startsOn: '2026-09-01', endsOn: '2027-07-31', isCurrent: true }).returning();
    await db.insert(holiday).values([
      { academicYearId: y!.id, title: 'Half term', startsOn: '2026-10-26', endsOn: '2026-10-30' },
      { academicYearId: y!.id, title: 'Staff training', startsOn: '2026-10-12', endsOn: '2026-10-12', studentsAttend: true },
      { academicYearId: y!.id, title: 'Winter break', startsOn: '2026-12-21', endsOn: '2027-01-01' }
    ]);
    expect(await holidaysBetween(db, '2026-09-01', '2026-10-29')).toEqual([{ title: 'Half term', from: '2026-10-26', to: '2026-10-30' }]);
  });
});

describe('admin "Forgotten your password?"', () => {
  beforeEach(resetDb);
  it('emails an admin a one-time link to the admin area, and says nothing for unknown emails', async () => {
    const { staff } = await makeStaff({ name: 'Head Teacher', email: 'head@example.org' });
    await requestPasswordLink(db, 'admin', 'nobody@example.org');
    await requestPasswordLink(db, 'admin', 'HEAD@example.org');
    const mails = await db.select().from(mailQueue);
    expect(mails.map((m) => m.toEmail)).toEqual([staff.email]);
    expect(mails[0]!.subject).toContain('admin area');
    const token = /\/admin\/set-password\/([A-Za-z0-9_-]+)/.exec(mails[0]!.html)![1]!;
    expect(await redeemPasswordLink(db, 'teacher', token, 'a long new password')).toMatchObject({ ok: false });
    expect(await redeemPasswordLink(db, 'admin', token, 'a long new password')).toMatchObject({ ok: true });
  });
});

describe('parent fee dates', () => {
  it('read like "Sat 31 Oct", with the year only when it isn’t this year', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(friendlyDate('2026-10-31', now)).toBe('Sat 31 Oct');
    expect(friendlyDate('2027-01-08', now)).toBe('Fri 8 Jan 2027');
  });
});
