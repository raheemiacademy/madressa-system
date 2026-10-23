/** Money is always integer pence. These are the only two conversions to and from text. */

/** "45", "£1,234.5", "0.50" → pence. Returns null for anything that isn't a plain non-negative amount. Never goes via floats. */
export function parsePounds(input: string): number | null {
  const s = input.trim().replace(/^£/, '').replace(/,(?=\d{3}(\D|$))/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

const whole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const pennies = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });

/** DESIGN.md: show pence only when non-zero — £45, £0.50, £1,234.50. */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? '−' : '';
  const abs = Math.abs(pence);
  return sign + (abs % 100 === 0 ? whole.format(abs / 100) : pennies.format(abs / 100));
}

/** Form value for an amount input: 4550 → "45.50", 4500 → "45". */
export const penceToInput = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));
