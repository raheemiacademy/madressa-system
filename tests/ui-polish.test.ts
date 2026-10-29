import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/db';
import { academicYear, holiday } from '@/db/schema';
import { figureAt } from '@/lib/count-up';
import { holidaysBetween } from '@/server/holidays';
import { db, resetDb } from './helpers';

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
