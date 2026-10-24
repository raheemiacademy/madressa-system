import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { schoolClass } from '@/db/schema';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { codeMap, expectedSessions, getRegister, registerMode } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';
import { TakeRegister } from './TakeRegister';

export const metadata = { title: 'Take register' };

/** Entry mode for one register. Admins with Can edit only; teachers take registers in their portal (Phase 8). */
export default async function Take({ searchParams }: { searchParams: Promise<{ class?: string; date?: string; time?: string }> }) {
  await requireAdmin('edit');
  const sp = await searchParams;
  const classId = Number(sp.class);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : todayIso();
  const [cls] = classId ? await db.select().from(schoolClass).where(eq(schoolClass.id, classId)) : [];
  if (!cls) return <div className="ra-page"><p className="ra-empty">Choose a class from the register page.</p></div>;
  const sessions = await expectedSessions(db, classId, date);
  const time = sp.time && sessions.some((s) => s.startTime.startsWith(sp.time!)) ? sp.time : sessions[0]?.startTime.slice(0, 5);
  const [reg, mode, codes] = time ? await Promise.all([getRegister(db, classId, date, time), registerMode(db), codeMap(db)]) : [null, 'classic' as const, {}];
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{cls.name} register</h1><p>{formatCalendarDate(date, 'EEEE d MMMM yyyy')}{time ? ` · ${time} session` : ''}{reg?.session?.takenAt ? ' · already taken, saving updates it' : ''}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/register/daily?class=${classId}&month=${date.slice(0, 7)}`}>Back to the grid</Link></div></div>
      <form className="ra-card ra-toolbar" action="/admin/register/take">
        <input type="hidden" name="class" value={classId} />
        <div className="ra-field"><label htmlFor="tr-d">Date</label><input className="ra-input" id="tr-d" type="date" name="date" defaultValue={date} /></div>
        {sessions.length > 1 && <div className="ra-field"><label htmlFor="tr-t">Session</label><select className="ra-select" id="tr-t" name="time" defaultValue={time}>{sessions.map((s) => <option key={s.id} value={s.startTime.slice(0, 5)}>{s.startTime.slice(0, 5)}</option>)}</select></div>}
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Change</button>
      </form>
      {!time || !reg ? <p className="ra-empty">No register is due for {cls.name} on this date: it’s a holiday, not a school day, or there’s no session in the timetable.</p>
        : reg.rows.length === 0 ? <p className="ra-empty">No students are in this class on this date.</p> : (
          <TakeRegister classId={classId} date={date} time={time} mode={mode}
            codes={Object.entries(codes).map(([code, c]) => ({ code, description: c.description, type: c.type }))}
            rows={reg.rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.surname}`, hasMedical: r.hasMedical, mark: r.mark ? { mark: r.mark.mark, code: r.mark.code, authorised: r.mark.authorised, notified: r.mark.notified, lateMinutes: r.mark.lateMinutes, leftEarlyMinutes: r.mark.leftEarlyMinutes, note: r.mark.note } : null,
              notice: r.notice ? { kind: r.notice.kind, reason: r.notice.reason, expectedArrival: r.notice.expectedArrival } : null }))} />
        )}
    </div>
  );
}
