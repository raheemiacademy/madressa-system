import Link from 'next/link';
import { logoutAction } from '@/app/_auth/actions';
import { PortalHead } from '@/app/_portal/Head';
import { Icon, type IconName } from '@/components/Icon';
import { requireTeacher } from '@/server/next/portal';
import { shows } from '@/server/portal/access';

export const metadata = { title: 'More' };

/** §20 Everything else in the teacher portal, with the school's links. Hidden sections aren't listed (and are refused on the server). */
export default async function More() {
  const t = await requireTeacher();
  const items = ([
    [null, '/teacher/classes', 'users', 'Classes and students', 'Class lists and student details'],
    ['Merits', '/teacher/merits', 'star', 'Merits', 'Award merits'],
    ['Incidents', '/teacher/incidents', 'alert', 'Incidents', 'Record an incident'],
    ['Exams|Progressive Tests', '/teacher/exams', 'exam', 'Exams and tests', 'Papers and results'],
    ['EOTY Reports', '/teacher/reports', 'exam', 'Report comments', 'End-of-term comments and scores'],
    ['Events', '/teacher/events', 'event', 'Events and trips', 'Who’s going'],
    ['Holiday Requests', '/teacher/holidays', 'calendar', 'Holiday requests', 'For students in your classes'],
    ['Forums', '/teacher/forums', 'chat', 'Forums', 'Talk with parents and colleagues'],
    ['Docs & Files', '/teacher/files', 'paperclip', 'Docs and files', 'Documents from the office'],
    ['Teacher Logs', '/teacher/logs', 'clock', 'My log', 'Sign-in and sign-out times'],
    [null, '/teacher/drill', 'alert', 'Fire drill', 'Roll call for your classes'],
    [null, '/teacher/change-password', 'lock', 'Change password', 'Choose a new password']
  ] as [string | null, string, IconName, string, string][]).filter(([s]) => !s || s.split('|').some((x) => shows(t.ctx, x)));
  const links = (t.ctx.tab.customLinks as { label: string; url: string }[] | undefined) ?? [];
  return (
    <>
      <PortalHead title="More" kicker={t.ctx.teacher.name} />
      <main className="rp-main">
        <nav aria-label="More">
          <ul className="rp-list">
            {items.map(([, href, icon, label, desc]) => (
              <li key={href}><Link className="tap" href={href} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-indigo)' }}><Icon name={icon} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><span className="t" style={{ display: 'block' }}>{label}</span><span className="m">{desc}</span></span>
              </Link></li>
            ))}
          </ul>
        </nav>
        {links.length > 0 && (
          <>
            <h2>From the school</h2>
            <ul className="rp-list">{links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer"><span className="t">{l.label}</span><span className="m" aria-hidden="true">↗</span></a></li>)}</ul>
          </>
        )}
        <form action={logoutAction.bind(null, 'teacher')}><button className="ra-btn tap" type="submit" style={{ width: '100%', minHeight: 48, justifyContent: 'center' }}>Sign out</button></form>
      </main>
    </>
  );
}
