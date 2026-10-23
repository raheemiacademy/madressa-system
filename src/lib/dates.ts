import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';

/** Calendar dates are 'YYYY-MM-DD' strings; instants are Date. Both are shown in the school's timezone. */
export const formatInstant = (d: Date, pattern: string, tz = 'Europe/London') => format(new TZDate(d, tz), pattern);
export const formatCalendarDate = (iso: string, pattern = 'dd/MM/yyyy') => format(new Date(`${iso}T12:00:00Z`), pattern);
export function greeting(now: Date, tz = 'Europe/London') {
  const h = new TZDate(now, tz).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
