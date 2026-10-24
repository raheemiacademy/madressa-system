import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';

/** Calendar dates are 'YYYY-MM-DD' strings; instants are Date. Both are shown in the school's timezone. */
export const formatInstant = (d: Date, pattern: string, tz = 'Europe/London') => format(new TZDate(d, tz), pattern);
export const formatCalendarDate = (iso: string, pattern = 'dd/MM/yyyy') => format(new Date(`${iso}T12:00:00Z`), pattern);
export function greeting(now: Date, tz = 'Europe/London') {
  const h = new TZDate(now, tz).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** "YYYY-MM-DDTHH:mm" (a datetime-local input) entered in UK time → instant. */
export const ukLocal = (s: string) => {
  const [d, t] = s.split('T') as [string, string];
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const [h, min] = t.split(':').map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, day, h, min, 'Europe/London').getTime());
};
/** An instant → the value a datetime-local input shows in UK time. */
export const toUkLocal = (d: Date) => formatInstant(d, "yyyy-MM-dd'T'HH:mm");
