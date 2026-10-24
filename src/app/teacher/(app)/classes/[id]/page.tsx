import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { classStudentsOn } from '@/server/attendance/registers';
import { requireTeacher } from '@/server/next/portal';
import { todayIso } from '@/server/people/common';

export const metadata = { title: 'Class list' };

/** A class list for one of the teacher's classes. */
export default async function ClassList({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const id = Number((await params).id);
  const cls = t.ctx.classes.find((c) => c.id === id);
  if (!cls) notFound();
  const kids = await classStudentsOn(db, id, todayIso());
  return (
    <>
      <PortalHead title={cls.name} kicker={kids.length === 1 ? '1 student' : `${kids.length} students`} back="/teacher/classes" />
      <main className="rp-main">
        {!kids.length ? <p className="rp-empty">No students in this class yet.</p> : (
          <ul className="rp-list">
            {kids.map((k) => <li key={k.id}><Link className="tap" href={`/teacher/students/${k.id}`}><span className="t">{k.firstName} {k.surname}</span><span className="v">{k.hasMedical && <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-bad)' }}><span>Medical</span></span>}</span></Link></li>)}
          </ul>
        )}
      </main>
    </>
  );
}
