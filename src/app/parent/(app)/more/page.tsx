import Link from 'next/link';
import { db } from '@/db';
import { logoutAction } from '@/app/_auth/actions';
import { PortalHead } from '@/app/_portal/Head';
import { Icon, type IconName } from '@/components/Icon';
import { requireParent } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import { partyUnread } from '@/server/portal/messages';

export const metadata = { title: 'More' };

/** §20 Everything else in the parent portal, with the school's links. Sections the school has hidden aren't listed (and are refused on the server). */
export default async function More() {
  const p = await requireParent();
  const unread = await partyUnread(db, p.party);
  const items: [string, IconName, string, string, string?][] = [
    ['/parent/messages', 'mail', 'Messages', unread ? `${unread} unread` : 'Write to the office or a teacher'],
    ...([
      ['Events', '/parent/events', 'event', 'Events and trips', 'Opt in, give consent and pay'],
      ['Term Reports', '/parent/reports', 'exam', 'Term reports', 'End-of-term reports'],
      ['Exam Results', '/parent/results', 'exam', 'Exam results', 'Marks and grades'],
      ['Merits', '/parent/merits', 'star', 'Merits', 'Merits and certificates'],
      ['Incidents', '/parent/incidents', 'alert', 'Incidents', 'Incidents the school has shared'],
      ['Products', '/parent/shop', 'receipt', 'Shop', 'Buy from the school shop'],
      ['Files', '/parent/files', 'paperclip', 'Files', 'Documents from the school']
    ] as const).filter(([s]) => shows(p.ctx, s)).map(([, h, i, l, d]) => [h, i, l, d] as [string, IconName, string, string]),
    ['/parent/forums', 'chat', 'Forums', 'Talk with other parents and teachers'],
    ['/parent/child', 'users', 'Your child’s details', p.ctx.tab.walkHomeConsent ? 'Check details and walk-home consent' : 'Check the details the school holds'],
    ['/parent/change-password', 'lock', 'Change password', 'Choose a new password']
  ];
  const links = [...(p.ctx.tab.customLinks as { label: string; url: string }[] ?? []),
    ...(['website', 'facebook', 'instagram', 'twitter', 'linkedin', 'whatsapp'] as const).filter((k) => p.ctx.tab[k]).map((k) => ({ label: k === 'twitter' ? 'X (Twitter)' : k[0]!.toUpperCase() + k.slice(1), url: String(p.ctx.tab[k]) }))];
  return (
    <>
      <PortalHead title="More" kicker={p.ctx.contact.name} />
      <main className="rp-main">
        <nav aria-label="More">
          <ul className="rp-list">
            {items.map(([href, icon, label, desc]) => (
              <li key={href}><Link className="tap" href={href} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-indigo)' }}><Icon name={icon} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><span className="t" style={{ display: 'block' }}>{label}</span><span className="m">{desc}</span></span>
                {href === '/parent/messages' && unread > 0 && <span className="rp-badge" style={{ position: 'static' }} aria-hidden="true">{unread}</span>}
              </Link></li>
            ))}
          </ul>
        </nav>
        {links.length > 0 && (
          <>
            <h2>From the school</h2>
            <ul className="rp-list">
              {links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}><span className="t">{l.label}</span><span className="m" aria-hidden="true">↗</span></a></li>)}
            </ul>
          </>
        )}
        <form action={logoutAction.bind(null, 'parent')}><button className="ra-btn tap" type="submit" style={{ width: '100%', minHeight: 48, justifyContent: 'center' }}>Sign out</button></form>
      </main>
    </>
  );
}
