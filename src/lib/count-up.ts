/** "£627.50" at progress p (0–1, eased) → "£313.75": keeps the prefix, suffix and decimals. Text with no number comes back as it is. */
export function figureAt(value: string, p: number): string {
  const m = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(value);
  if (!m || p >= 1) return value;
  const pre = m[1]!, num = m[2]!, post = m[3]!;
  const to = Number(num.replace(/,/g, '')), dec = (num.split('.')[1] ?? '').length;
  const eased = 1 - Math.pow(1 - Math.max(0, p), 3);
  return pre + (to * eased).toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
}
