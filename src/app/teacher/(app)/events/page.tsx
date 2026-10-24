import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { event } from '@/db/schema';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { getEvent } from '@/server/learning/events';
import { requireTeacher } from '@/server/next/portal';
import { studentsInClasses } from '@/server/portal/access';
import { todayIso } from '@/server/people/common';

export const metadata = { title: 'Events and trips' };

/** §8/§20 Upcoming events for the teacher's classes, with who from those classes has opted in. */
export default async function Events() {
  const t = await requireTeacher('Events');
  const classIds = t.ctx.classes.map((c) => c.id);
  const [evs, kids] = await Promise.all([
    t.ctx.year ? db.select().from(event).where(and(eq(event.academicYearId, t.ctx.year.id), eq(event.active, true), gte(event.date, todayIso()))).orderBy(asc(event.date)) : [],
    studentsInClasses(db, classIds)
  ]);
  const mine = evs.filter((e) => !e.classIds.length || e.classIds.some((c) => classIds.includes(c)));
  const details = await Promise.all(mine.map((e) => getEvent(db, e.id)));
  return (
    <>
      <PortalHead title="Events and trips" back="/teacher/more" />
      <main className="rp-main">
        {!mine.length && <p className="rp-empty">No upcoming events for your classes.</p>}
        {mine.map((e, i) => {
          const going = details[i]!.optIns.filter((o) => kids.some((k) => k.id === o.o.studentId));
          return (
            <section key={e.id} className="ra-card" aria-labelledby={`ev-${e.id}`} style={{ display: 'grid', gap: 6 }}>
              <h2 id={`ev-${e.id}`} style={{ margin: 0, fontSize: 16 }}>{e.name}</h2>
              <div className="ra-note">{formatCalendarDate(e.date)}{e.time ? `, ${e.time.slice(0, 5)}` : ''}</div>
              <p style={{ margin: 0 }}><b>{going.length === 1 ? '1 of your students is going' : `${going.length} of your students are going`}</b>{going.length ? `: ${going.map((o) => `${o.firstName} ${o.surname}`).join(', ')}` : ''}</p>
            </section>
          );
        })}
      </main>
    </>
  );
}
