import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { formatCalendarDate } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { studentProfile } from '@/server/portal/teacher';

export const metadata = { title: 'Student' };

/** §20 A student in one of the teacher's classes, showing only what Settings → Teacher portal allows. */
export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await studentProfile(db, t.ctx, id) : null;
  if (!s) notFound();
  const rows: [string, string | null][] = [['Date of birth', s.dob ? formatCalendarDate(s.dob) : null], ['Email', s.email], ['Mobile', s.mobile], ['Address', s.address]];
  return (
    <>
      <PortalHead title={s.name} kicker={t.ctx.classes.find((c) => c.id === s.classId)?.name} back={`/teacher/classes/${s.classId}`} />
      <main className="rp-main">
        {s.hasMedical && <div className="ra-banner" style={{ ['--c' as string]: 'var(--color-bad)' }}><div>Medical notes are held by the office. Ask them before activities.</div></div>}
        {rows.some(([, v]) => v) && (
          <section className="ra-card" aria-label="Details"><dl className="rp-dl">{rows.filter(([, v]) => v).flatMap(([k, v]) => [<dt key={`${k}t`}>{k}</dt>, <dd key={`${k}d`}>{v}</dd>])}</dl></section>
        )}
        {s.contacts.length > 0 && (
          <>
            <h2>Contacts</h2>
            <ul className="rp-list">{s.contacts.map((c, i) => <li key={i}><span className="t">{c.name}</span><span className="v ra-muted">{c.type}{c.isPrimary ? ' · main' : ''}</span><span className="m">{[c.mobile, c.email].filter(Boolean).join(' · ') || 'No phone or email'}</span></li>)}</ul>
          </>
        )}
        {!rows.some(([, v]) => v) && !s.contacts.length && <p className="rp-empty">The school shares only names with teachers.</p>}
      </main>
    </>
  );
}
