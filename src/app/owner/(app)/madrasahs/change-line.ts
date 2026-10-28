import type { ownerAction } from '@/db/schema';

type Row = typeof ownerAction.$inferSelect;
const WORDS: Record<string, [string, string]> = { add: ['Adding', 'Added'], suspend: ['Pausing', 'Paused'], resume: ['Resuming', 'Resumed'], remove: ['Removing', 'Removed'] };

/** An add, pause, resume or removal in a few words: where it's got to, and when. */
export function changeLine(c: Row, format: (d: Date, pattern: string) => string) {
  const [doing, done] = WORDS[c.action] ?? [c.action, c.action];
  const at = (d: Date) => format(d, 'HH:mm');
  const what = c.action === 'add' ? ` at ${c.address}${c.demo ? ' (demo)' : ''}` : '';
  if (!c.startedAt) return { state: 'Waiting', tone: 'off', text: `· ${doing.toLowerCase()}${what}, asked at ${at(c.requestedAt)}; waiting for the server.` };
  if (!c.finishedAt) return { state: 'Working', tone: 'warn', text: `· ${doing.toLowerCase()}${what} since ${at(c.startedAt)}.` };
  if (c.result === 'Done') return { state: 'Done', tone: '', text: `· ${done.toLowerCase()}${what} at ${at(c.finishedAt)}.` };
  return { state: 'Failed', tone: 'bad', text: `· ${doing.toLowerCase()}${what}: ${c.result} (${at(c.finishedAt)}).` };
}
