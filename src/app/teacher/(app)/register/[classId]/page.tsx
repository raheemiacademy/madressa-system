import { notFound } from 'next/navigation';
import { db } from '@/db';
import { TakeRegister } from '@/app/admin/(app)/register/take/TakeRegister';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { addDays, codeMap, expectedSessions, getRegister, registerMode } from '@/server/attendance/registers';
import { requireTeacher } from '@/server/next/portal';
import { todayIso } from '@/server/people/common';
import { classOf, PortalDenied } from '@/server/portal/access';
import { registerAction } from '../../actions';

export const metadata = { title: 'Take register' };

/** §6/§20 Take a register (design: TeacherRegister): P/L/A per student, parents' notes shown, live counts, one save. */
export default async function Take({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ date?: string; time?: string }> }) {
  const t = await requireTeacher('Registers');
  const classId = Number((await params).classId);
  const cls = (() => { try { return classOf(t.ctx, classId, 'canRegister'); } catch (e) { if (e instanceof PortalDenied) return null; throw e; } })();
  if (!cls) notFound();
  const sp = await searchParams;
  const today = todayIso();
  const date = sp.date && sp.date <= today && sp.date >= addDays(today, -7) ? sp.date : today;
  const sessions = await expectedSessions(db, classId, date);
  const time = sp.time && sessions.some((s) => s.startTime.startsWith(sp.time!)) ? sp.time : sessions[0]?.startTime.slice(0, 5);
  const [reg, mode, codes] = time ? await Promise.all([getRegister(db, classId, date, time), registerMode(db), codeMap(db)]) : [null, 'classic' as const, {}];
  return (
    <>
      <PortalHead title={`${cls.name} register`} kicker={`${formatCalendarDate(date, 'EEE d MMM')}${time ? ` · ${time} session` : ''}${reg?.session?.takenAt ? ' · taken, saving updates it' : ''}`} back={`/teacher/register?date=${date}`} />
      <main className="rp-main">
        {!time || !reg ? <p className="rp-empty">No register is due for {cls.name} on this day.</p>
          : !reg.rows.length ? <p className="rp-empty">No students are in this class on this day.</p> : (
            <TakeRegister save={registerAction.bind(null, classId, date, time)} mode={mode} office={false}
              codes={Object.entries(codes).map(([code, c]) => ({ code, description: c.description, type: c.type }))}
              rows={reg.rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.surname}`, hasMedical: r.hasMedical, mark: r.mark ? { mark: r.mark.mark, code: r.mark.code, authorised: r.mark.authorised, notified: r.mark.notified, lateMinutes: r.mark.lateMinutes, leftEarlyMinutes: r.mark.leftEarlyMinutes, note: r.mark.note } : null,
                notice: r.notice ? { kind: r.notice.kind, reason: r.notice.reason, expectedArrival: r.notice.expectedArrival } : null }))} />
          )}
      </main>
    </>
  );
}
