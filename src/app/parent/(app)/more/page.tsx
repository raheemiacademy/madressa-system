import Link from 'next/link';
import { db } from '@/db';
import { logoutAction } from '@/app/_auth/actions';
import { PortalHead } from '@/app/_portal/Head';
import { Icon } from '@/components/Icon';
import { SoundToggle } from '@/components/SoundToggle';
import { PushToggle } from '@/app/_portal/PushToggle';
import { vapidKeys } from '@/server/comm/push';
import { ThemeToggle } from '@/components/ThemeToggle';
import { requireParent } from '@/server/next/portal';
import { partyUnread } from '@/server/portal/messages';
import { parentLinks, parentMenu } from '../menu';

export const metadata = { title: 'More' };

/** §20 Everything else in the parent portal, with the school's links. Sections the school has hidden aren't listed (and are refused on the server). */
export default async function More() {
  const p = await requireParent();
  const unread = await partyUnread(db, p.party);
  const items = parentMenu(p, unread);
  const links = parentLinks(p);
  return (
    <>
      <PortalHead title="More" kicker={p.ctx.contact.name} />
      <main className="rp-main">
        <nav aria-label="More">
          <ul className="rp-list">
            {items.map(({ href, icon, label, desc, badge }) => (
              <li key={href}><Link className="tap" href={href} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-indigo)' }}><Icon name={icon} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><span className="t" style={{ display: 'block' }}>{label}</span><span className="m">{desc}</span></span>
                {!!badge && <span className="rp-badge" style={{ position: 'static' }} aria-hidden="true">{badge}</span>}
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
        <ThemeToggle className="ra-card ra-toggle-row tap" label />
        <PushToggle portal="parent" publicKey={(await vapidKeys(db)).publicKey} variant="row" />
        <SoundToggle className="ra-card ra-toggle-row tap" />
        <form action={logoutAction.bind(null, 'parent')}><button className="ra-btn tap" type="submit" style={{ width: '100%', minHeight: 48, justifyContent: 'center' }}>Sign out</button></form>
      </main>
    </>
  );
}
