import { formatInstant } from './dates';

// How the owner dashboard writes numbers, times and sizes (as in design-reference/owner/owner-dashboard-design.html).
const nf = new Intl.NumberFormat('en-GB');
export const num = (v: number | null | undefined) => v == null ? '—' : nf.format(v);
export const plural = (n: number, one: string, many: string) => n === 1 ? one : many;

/** "Just now", "5 min ago", "2 hours ago", "Yesterday", "14 days ago". */
export function ago(d: Date | null, now: Date) {
  if (!d) return 'Never';
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${plural(h, 'hour', 'hours')} ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/** "Today 02:00", "Yesterday 02:00", "Mon 06:00" within the week, then "21/10 02:00" (UK time). */
export function whenShort(d: Date, now: Date) {
  const day = (x: Date) => formatInstant(x, 'yyyy-MM-dd');
  const time = formatInstant(d, 'HH:mm');
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return formatInstant(d, 'EEE HH:mm');
  return formatInstant(d, 'dd/MM HH:mm');
}

/** "12 days", "3 hours", "25 min": how long something has been running. */
export function duration(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${plural(h, 'hour', 'hours')}`;
  const d = Math.floor(h / 24);
  return `${d} ${plural(d, 'day', 'days')}`;
}

/** Sizes in binary units, as the server's own tools show them: "318 MB", "1.2 GB". */
export function size(b: number | null | undefined) {
  if (b == null) return '—';
  if (b < 1024 ** 2) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${(b / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GB`;
}

/** "49 of 80 GB". */
export const sizeOf = (used: number, total: number) => `${size(used).replace(/ GB$/, '')} of ${size(total)}`;
