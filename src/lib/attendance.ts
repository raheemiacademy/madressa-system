/**
 * How a register mark counts. Shared by the server (stats) and the browser (grids), so it has no imports.
 *
 * Standard % = (present + late) / sessions counted. Strict % = present on time / sessions counted.
 * Authorised absences still count as absences (as in DfE statistics); approved educational activity counts as present;
 * "not counted" marks and DfE not-counted codes are left out of both.
 */
export type MarkKind = 'present' | 'late' | 'absent' | 'left_early' | 'not_counted';
export type CodeType = 'present' | 'approved' | 'authorised' | 'unauthorised' | 'not_counted';
export type MarkLike = { mark: MarkKind; code?: string | null; authorised?: boolean | null; notified?: boolean; lateMinutes?: number | null; leftEarlyMinutes?: number | null };
export type CodeInfo = { type: CodeType; isLate: boolean };

export type Classified = { counted: boolean; onTime: boolean; late: boolean; absent: boolean; authorised: boolean | null; notified: boolean; leftEarly: boolean };

export function classify(m: MarkLike, codes?: Record<string, CodeInfo>): Classified {
  const base = { notified: !!m.notified, leftEarly: m.mark === 'left_early' };
  const info = m.code && codes ? codes[m.code] : undefined;
  if (info) {
    // DfE mode: the code decides.
    if (info.type === 'not_counted') return { ...base, counted: false, onTime: false, late: false, absent: false, authorised: null };
    if (info.type === 'present' || info.type === 'approved') return { ...base, counted: true, onTime: !info.isLate, late: info.isLate, absent: false, authorised: null };
    if (info.type === 'unauthorised' && info.isLate) return { ...base, counted: true, onTime: false, late: true, absent: true, authorised: false };
    return { ...base, counted: true, onTime: false, late: false, absent: true, authorised: info.type === 'authorised' };
  }
  switch (m.mark) {
    case 'present': case 'left_early': return { ...base, counted: true, onTime: true, late: false, absent: false, authorised: null };
    case 'late': return { ...base, counted: true, onTime: false, late: true, absent: false, authorised: m.authorised ?? null };
    case 'absent': return { ...base, counted: true, onTime: false, late: false, absent: true, authorised: m.authorised ?? null };
    case 'not_counted': return { ...base, counted: false, onTime: false, late: false, absent: false, authorised: null };
  }
}

/**
 * Grid letter (DESIGN.md register grid: never colour alone).
 * P present · L late · A authorised absence · N notified absence (no decision yet) · U unauthorised or unexplained absence · E left early · – not counted.
 * In DfE mode the code itself is shown.
 */
export function letter(m: MarkLike, codes?: Record<string, CodeInfo>): string {
  if (m.code && codes?.[m.code]) return m.code;
  switch (m.mark) {
    case 'present': return 'P';
    case 'late': return 'L';
    case 'left_early': return 'E';
    case 'not_counted': return '–';
    case 'absent': return m.authorised === true ? 'A' : m.authorised === null && m.notified ? 'N' : 'U';
  }
}

export const LETTER_NAMES: Record<string, string> = { P: 'Present', L: 'Late', A: 'Authorised absence', N: 'Notified absence', U: 'Unauthorised absence', E: 'Left early', '–': 'Not counted', H: 'Holiday', C: 'Closed' };

export type Summary = {
  sessions: number; present: number; late: number; absent: number; absentAuthorised: number; absentUnauthorised: number; absentUnspecified: number;
  lateMinutes: number; leftEarly: number; leftEarlyMinutes: number; notified: number; lateAuthorised: number; lateUnauthorised: number;
  standardPct: number | null; strictPct: number | null;
};

export function summarise(marks: MarkLike[], codes?: Record<string, CodeInfo>): Summary {
  const s: Summary = { sessions: 0, present: 0, late: 0, absent: 0, absentAuthorised: 0, absentUnauthorised: 0, absentUnspecified: 0, lateMinutes: 0, leftEarly: 0, leftEarlyMinutes: 0, notified: 0, lateAuthorised: 0, lateUnauthorised: 0, standardPct: null, strictPct: null };
  for (const m of marks) {
    const c = classify(m, codes);
    if (!c.counted) continue;
    s.sessions++;
    if (c.onTime) s.present++;
    if (c.late && !c.absent) { s.late++; s.lateMinutes += m.lateMinutes ?? 0; if (c.authorised === true) s.lateAuthorised++; if (c.authorised === false) s.lateUnauthorised++; }
    if (c.absent) {
      s.absent++;
      if (c.authorised === true) s.absentAuthorised++; else if (c.authorised === false) s.absentUnauthorised++; else s.absentUnspecified++;
    }
    if (c.leftEarly) { s.leftEarly++; s.leftEarlyMinutes += m.leftEarlyMinutes ?? 0; }
    if (c.notified) s.notified++;
  }
  if (s.sessions) {
    s.standardPct = Math.round(((s.present + s.late) / s.sessions) * 1000) / 10;
    s.strictPct = Math.round((s.present / s.sessions) * 1000) / 10;
  }
  return s;
}

/** Attendance quality band used on the stats page. */
export const quality = (pct: number | null) => pct === null ? '' : pct >= 97 ? 'Excellent' : pct >= 95 ? 'Good' : pct >= 90 ? 'Needs improvement' : 'Serious concern';

export const pct1 = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
