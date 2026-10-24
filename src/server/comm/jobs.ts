import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { currentYear } from '../academic-years';
import { generateInvoices } from '../fees/generate';
import { collectDirectDebits } from '../portal/fees';
import { todayIso } from '../people/common';
import { readTab } from '../settings';
import { processMailQueue } from './mail';
import { sendAttendanceAlerts } from './notify';
import { processSmsQueue } from './sms';

const SYSTEM = { identityId: null, name: 'Scheduled job' };

/** Claims a job for a day. Only one worker gets true, so daily work runs once. */
export async function claimDay(db: Db, key: string, day: string) {
  const rows = await db.execute(sql`insert into job_run (key, last_run_on) values (${key}, ${day}::date)
    on conflict (key) do update set last_run_on = excluded.last_run_on, updated_at = now() where job_run.last_run_on < excluded.last_run_on returning key`);
  return rows.length > 0;
}

/** The daily work, from 06:00 UK time: attendance alert emails (if switched on) and fees invoices due up to today. */
export async function runDaily(db: Db, now = new Date()) {
  if (Number(formatInstant(now, 'H')) < 6) return false;
  const today = todayIso(now);
  if (!(await claimDay(db, 'daily', today))) return false;
  if ((await readTab(db, 'alerts')).enabled) await sendAttendanceAlerts(db, SYSTEM, today);
  const year = await currentYear(db);
  if (year && today >= year.startsOn && today <= year.endsOn) await generateInvoices(db, SYSTEM, year.id, { scope: 'today' }, { today });
  // Families with a direct debit pay what's due without doing anything (§20 "collected automatically").
  await collectDirectDebits(db, SYSTEM, { dueBy: today });
  return true;
}

/** One worker pass: send due emails and texts, then the daily jobs. Each part's failure is logged, not fatal. */
export async function tick(db: Db) {
  for (const [name, step] of [['mail', processMailQueue], ['sms', processSmsQueue], ['daily', runDaily]] as const) {
    try { await step(db); } catch (e) { console.error(`[worker] ${name} failed:`, (e as Error).message); }
  }
}
