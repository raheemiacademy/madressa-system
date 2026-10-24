import { describe, expect, it } from 'vitest';
import { classify, letter, quality, summarise, type CodeInfo } from '@/lib/attendance';

const codes: Record<string, CodeInfo> = {
  '/': { type: 'present', isLate: false }, L: { type: 'present', isLate: true }, V: { type: 'approved', isLate: false },
  I: { type: 'authorised', isLate: false }, O: { type: 'unauthorised', isLate: false }, U: { type: 'unauthorised', isLate: true }, '#': { type: 'not_counted', isLate: false }
};

describe('classic marks', () => {
  it('letters never rely on colour and distinguish absence decisions', () => {
    expect(letter({ mark: 'present' })).toBe('P');
    expect(letter({ mark: 'late' })).toBe('L');
    expect(letter({ mark: 'absent', authorised: true })).toBe('A');
    expect(letter({ mark: 'absent', authorised: null, notified: true })).toBe('N');
    expect(letter({ mark: 'absent', authorised: false, notified: true })).toBe('U');
    expect(letter({ mark: 'absent', authorised: null })).toBe('U');
    expect(letter({ mark: 'left_early' })).toBe('E');
  });

  it('standard counts lates as attending; strict does not', () => {
    const s = summarise([{ mark: 'present' }, { mark: 'present' }, { mark: 'late', lateMinutes: 10 }, { mark: 'absent', authorised: true }, { mark: 'not_counted' }]);
    expect(s).toMatchObject({ sessions: 4, present: 2, late: 1, absent: 1, absentAuthorised: 1, lateMinutes: 10, standardPct: 75, strictPct: 50 });
  });

  it('rounds to one decimal and copes with no sessions', () => {
    expect(summarise([{ mark: 'present' }, { mark: 'present' }, { mark: 'absent' }]).standardPct).toBe(66.7);
    expect(summarise([]).standardPct).toBeNull();
    expect(summarise([{ mark: 'not_counted' }]).sessions).toBe(0);
  });

  it('left early counts as present and tracks minutes', () => {
    expect(summarise([{ mark: 'left_early', leftEarlyMinutes: 15 }])).toMatchObject({ present: 1, leftEarly: 1, leftEarlyMinutes: 15, standardPct: 100 });
  });
});

describe('DfE codes', () => {
  it('maps code types to present, approved, authorised, unauthorised and not counted', () => {
    expect(classify({ mark: 'present', code: 'V' }, codes)).toMatchObject({ counted: true, onTime: true, absent: false });
    expect(classify({ mark: 'absent', code: 'I' }, codes)).toMatchObject({ absent: true, authorised: true });
    expect(classify({ mark: 'absent', code: 'O' }, codes)).toMatchObject({ absent: true, authorised: false });
    expect(classify({ mark: 'not_counted', code: '#' }, codes).counted).toBe(false);
    expect(letter({ mark: 'absent', code: 'I' }, codes)).toBe('I');
  });

  it('L is late-but-present; U is late after registers closed and counts as an unauthorised absence', () => {
    const s = summarise([{ mark: 'late', code: 'L' }, { mark: 'absent', code: 'U' }, { mark: 'present', code: '/' }, { mark: 'not_counted', code: '#' }], codes);
    expect(s).toMatchObject({ sessions: 3, present: 1, late: 1, absent: 1, absentUnauthorised: 1, standardPct: 66.7, strictPct: 33.3 });
  });
});

it('quality bands', () => {
  expect([quality(98), quality(95), quality(92), quality(80), quality(null)]).toEqual(['Excellent', 'Good', 'Needs improvement', 'Serious concern', '']);
});
