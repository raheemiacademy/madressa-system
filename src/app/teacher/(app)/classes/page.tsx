import Link from 'next/link';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { requireTeacher } from '@/server/next/portal';
import { studentsInClasses } from '@/server/portal/access';

export const metadata = { title: 'Classes' };
const PRIV: [string, string][] = [['canRegister', 'registers'], ['canHomework', 'homework'], ['canMerits', 'merits'], ['canIncidents', 'incidents'], ['canEoty', 'reports'], ['canMessage', 'messaging']];

/** §20 The teacher's classes this year, with what they can do in each. */
export default async function Classes() {
  const t = await requireTeacher();
  const kids = await studentsInClasses(db, t.ctx.classes.map((c) => c.id));
  return (
    <>
      <PortalHead title="Classes" back="/teacher/more" />
      <main className="rp-main">
        {!t.ctx.classes.length ? <p className="rp-empty">You aren’t attached to any classes this year. The office can add you.</p> : (
          <ul className="rp-list">
            {t.ctx.classes.map((c) => {
              const n = kids.filter((k) => k.classId === c.id).length;
              const can = PRIV.filter(([k]) => (c as unknown as Record<string, boolean>)[k]).map(([, l]) => l);
              return <li key={c.id}><Link className="tap" href={`/teacher/classes/${c.id}`}><span className="t">{c.name}{c.isMain ? ' (main teacher)' : ''}</span><span className="v ra-muted">{n === 1 ? '1 student' : `${n} students`}</span><span className="m">{can.length ? `You can do: ${can.join(', ')}` : 'View only'}</span></Link></li>;
            })}
          </ul>
        )}
      </main>
    </>
  );
}
