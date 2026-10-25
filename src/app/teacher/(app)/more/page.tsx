import Link from 'next/link';
import { logoutAction } from '@/app/_auth/actions';
import { PortalHead } from '@/app/_portal/Head';
import { Icon } from '@/components/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { requireTeacher } from '@/server/next/portal';
import { teacherLinks, teacherMenu } from '../menu';

export const metadata = { title: 'More' };

/** §20 Everything else in the teacher portal, with the school's links. Hidden sections aren't listed (and are refused on the server). */
export default async function More() {
  const t = await requireTeacher();
  const items = teacherMenu(t);
  const links = teacherLinks(t);
  return (
    <>
      <PortalHead title="More" kicker={t.ctx.teacher.name} />
      <main className="rp-main">
        <nav aria-label="More">
          <ul className="rp-list">
            {items.map(({ href, icon, label, desc }) => (
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
        <ThemeToggle className="ra-card ra-toggle-row tap" label />
        <form action={logoutAction.bind(null, 'teacher')}><button className="ra-btn tap" type="submit" style={{ width: '100%', minHeight: 48, justifyContent: 'center' }}>Sign out</button></form>
      </main>
    </>
  );
}
