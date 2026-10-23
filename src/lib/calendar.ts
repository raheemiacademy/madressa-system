/** Month grids for a date range, Monday first. Dates are 'YYYY-MM-DD' strings computed in UTC so no timezone can shift a day. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function monthsBetween(startIso: string, endIso: string) {
  const out: { year: number; month: number }[] = [];
  const d = new Date(`${startIso.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endIso.slice(0, 7)}-01T00:00:00Z`);
  while (d <= end) { out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() }); d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}

/** Weeks of 7 cells; cells outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let i = 1; i <= days; i++) cells.push(iso(new Date(Date.UTC(year, month, i))));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
