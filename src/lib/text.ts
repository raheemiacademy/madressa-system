import { formatPence } from './money';

const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
const firstGrapheme = (w: string) => (seg ? seg.segment(w)[Symbol.iterator]().next().value?.segment ?? '' : Array.from(w)[0] ?? '');

/** Avatar initials from the first and last word, grapheme-safe; honorifics are skipped (DESIGN.md message list item). */
export function initials(name: string): string {
  const words = String(name || '').replace(/^(Ustadh|Ustadha|Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '').split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(firstGrapheme(w)));
  if (!words.length) return '·';
  const pick = words.length > 1 ? [words[0]!, words[words.length - 1]!] : [words[0]!];
  return pick.map(firstGrapheme).join('').toLocaleUpperCase('en-GB');
}

/** Singular/plural wording: plural(1, 'invoice') → "1 invoice", plural(3, 'invoice') → "3 invoices". */
const rules = new Intl.PluralRules('en-GB');
export function plural(n: number, one: string, other = `${one}s`) {
  return `${n.toLocaleString('en-GB')} ${rules.select(n) === 'one' ? one : other}`;
}

/** A week-on-week change for a KPI tile: "+3", "−£12.50", "+1.5 pts", or "No change" at 0 (DESIGN.md KPI tile). */
export function formatChange(v: number, unit: 'count' | 'pts' | 'pence') {
  if (v === 0) return 'No change';
  const a = Math.abs(v);
  return (v > 0 ? '+' : '−') + (unit === 'pence' ? formatPence(a) : unit === 'pts' ? `${a.toFixed(1)} pts` : a.toLocaleString('en-GB'));
}
