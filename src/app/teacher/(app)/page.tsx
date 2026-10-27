import { ThemeToggle } from '@/components/ThemeToggle';
import Link from 'next/link';
import { PushToggle } from '@/app/_portal/PushToggle';
import { vapidKeys } from '@/server/comm/push';
import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { initials, plural } from '@/lib/text';
import { runningDrill } from '@/server/attendance/drill';
import { requireTeacher } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { classesToday, myHomework, myLog, notesToday } from '@/server/portal/teacher';
import { signAction } from './actions';

export const metadata = { title: 'Today' };

/** §20 Teacher home (design: TeacherToday): sign in/out, today's classes and registers, homework handed in, parents' notes. */
export default async function Today() {
  const t = await requireTeacher();
  const now = new Date();
  const [log, classes, notes, hw, drill] = await Promise.all([myLog(db, t.ctx.teacher.id), classesToday(db, t.ctx), notesToday(db, t.ctx), shows(t.ctx, 'Homework') ? myHomework(db, t.ctx) : [], runningDrill(db)]);
  const signedIn = !!log?.timeIn && !log.timeOut && !log.absent;
  const latest = hw.find((h) => h.h.deadlineAt >= new Date(now.getTime() - 7 * 86_400_000)) ?? null;
  const absent = notes.filter((n) => n.n.kind === 'absent').length;
  const meritClass = t.ctx.classes.find((c) => c.canMerits);
  return (
    <>
      <header className="rp-head">
        <span className="rp-av" aria-hidden="true" style={{ width: 44, height: 44 }}>{initials(t.ctx.teacher.name)}</span>
        <div><small>{formatInstant(now, 'EEEE d MMMM')}</small><h1 style={{ fontSize: 20, fontFamily: 'inherit', fontWeight: 600 }}>{t.ctx.teacher.name}</h1></div>
        <ThemeToggle className="rp-icon-btn tap" />
      </header>
      <main className="rp-main">
        <PushToggle portal="teacher" publicKey={(await vapidKeys(db)).publicKey} variant="card" />
        {drill && <Link className="ra-banner" href="/teacher/drill" style={{ ['--c' as string]: 'var(--color-bad)', color: 'inherit' }}><div><b>Fire drill in progress.</b> Open your roll call.</div></Link>}
        <section className={signedIn ? 'rp-hero' : 'ra-card'} aria-label="Signing in" style={{ flexDirection: 'row', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <small style={{ display: 'block', fontSize: 13, color: signedIn ? 'var(--ra-on-ink-muted)' : 'var(--color-fg-muted)' }}>{signedIn ? 'Signed in at' : log?.timeOut ? 'Signed out at' : 'Not signed in yet'}</small>
            <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 26, lineHeight: 1.2 }}>{signedIn ? log!.timeIn!.slice(0, 5) : log?.timeOut ? log.timeOut.slice(0, 5) : formatInstant(now, 'HH:mm')}</div>
          </div>
          {!log?.timeOut && <ActionButton action={signAction} label={signedIn ? 'Sign out' : 'Sign in'} className={`ra-btn tap${signedIn ? '' : ' primary'}`} />}
        </section>

        <section aria-labelledby="h-classes" style={{ display: 'grid', gap: 10 }}>
          <h2 id="h-classes">Your classes today</h2>
          {!classes.length ? <p className="rp-empty">No classes in your timetable today.</p> : classes.map((c) => {
            const body = (
              <>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{c.start}<br /><span style={{ fontWeight: 400, color: 'var(--color-fg-muted)' }}>{c.end}</span></span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 15 }}>{c.className}{c.subject ? ` · ${c.subject}` : ''}</b>
                  <small style={{ display: 'block', fontSize: 13, color: 'var(--color-fg-muted)' }}>{[c.room, plural(c.students, 'student')].filter(Boolean).join(' · ')}</small>
                  {c.takesRegister && <small style={{ display: 'block', fontSize: 13, marginTop: 4, color: c.taken ? 'var(--color-ok)' : 'var(--ra-accent-text)', fontWeight: 600 }}>{c.taken ? 'Register taken' : c.canRegister ? 'Take register' : 'Register not taken'}</small>}
                  {!c.takesRegister && <small style={{ display: 'block', fontSize: 13, color: 'var(--color-fg-muted)' }}>No register for this session</small>}
                </span>
              </>
            );
            const style = { display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr)', gap: 14, background: 'var(--color-panel)', border: '1px solid var(--color-border-line)', borderRadius: 18, padding: '14px 16px', color: 'inherit', textDecoration: 'none' };
            return c.takesRegister && c.canRegister && shows(t.ctx, 'Registers')
              ? <Link key={`${c.classId}-${c.start}`} className="tap" style={style} href={`/teacher/register/${c.classId}?time=${c.start}`}>{body}</Link>
              : <div key={`${c.classId}-${c.start}`} style={style}>{body}</div>;
          })}
        </section>

        <div className="rp-tiles">
          {latest && (
            <Link className="rp-tile tap" href={`/teacher/homework/${latest.h.id}`}>
              <small>Homework done</small><strong>{latest.completed} <span style={{ fontSize: 15, color: 'var(--color-fg-muted)' }}>of {latest.total}</span></strong><small>{latest.h.title}</small>
            </Link>
          )}
          <div className="rp-tile">
            <small>Parent notes</small><strong>{notes.length}</strong>
            <small>{notes.length ? `${plural(absent, 'absence')}, ${plural(notes.length - absent, 'late')} today` : 'None today'}</small>
          </div>
        </div>
        {notes.length > 0 && (
          <ul className="rp-list" aria-label="Parent notes today">
            {notes.map(({ n, firstName, surname }) => <li key={n.id}><span className="t">{firstName} {surname}</span><span className="v ra-muted">{n.kind === 'late' ? `Late${n.expectedArrival ? `, ${n.expectedArrival.slice(0, 5)}` : ''}` : 'Absent'}</span>{n.reason && <span className="m">{n.reason}</span>}</li>)}
          </ul>
        )}
        {meritClass && shows(t.ctx, 'Merits') && (
          <Link className="rp-row tap" href={`/teacher/merits?class=${meritClass.id}`}>
            <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-violet)' }}><Icon name="star" /></span>
            <span><b>Award merits to {meritClass.name}</b></span><span className="go" aria-hidden="true">›</span>
          </Link>
        )}
      </main>
    </>
  );
}
