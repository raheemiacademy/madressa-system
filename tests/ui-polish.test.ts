import { describe, expect, it } from 'vitest';
import { figureAt } from '@/lib/count-up';

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
