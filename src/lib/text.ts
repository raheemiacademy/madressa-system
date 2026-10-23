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
