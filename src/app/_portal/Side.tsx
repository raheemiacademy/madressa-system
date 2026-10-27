'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/_auth/actions';
import { Icon, type IconName } from '@/components/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';

type Item = { href: string; label: string; icon: IconName; badge?: number };

/**
 * Desktop sidebar for the parent and teacher portals, in the admin's style: on wide screens it replaces the bottom tab bar.
 * The first item is the portal's home and only matches exactly.
 */
export function PortalSide({ school, sub, portal, groups, links }: {
  school: string; sub: string; portal: 'parent' | 'teacher'; groups: { label: string; items: Item[] }[]; links: { label: string; url: string }[];
}) {
  const path = usePathname();
  const home = groups[0]?.items[0]?.href;
  const current = (href: string) => (href === home ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <aside className="ra-side rp-side" aria-label="Main menu">
      <Link className="ra-brand" href={home ?? `/${portal}`}>
        <span className="ra-brand-mark"><Icon name="school" size={20} /></span>
        <span className="ra-brand-text"><span className="ra-brand-name">{school}</span><span className="ra-brand-sub">{sub}</span></span>
      </Link>
      <nav className="ra-nav" aria-label="Sections">
        {groups.filter((g) => g.items.length).map((g) => (
          <div className="ra-nav-group" key={g.label}>
            <div className="ra-nav-label">{g.label}</div>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className="ra-nav-btn" aria-current={current(i.href) ? 'page' : undefined}>
                <Icon name={i.icon} /><span>{i.label}</span>
                {!!i.badge && <b className="rp-side-badge" aria-label={`${i.badge} unread`}>{i.badge}</b>}
              </Link>
            ))}
          </div>
        ))}
        {links.length > 0 && (
          <div className="ra-nav-group">
            <div className="ra-nav-label">From the school</div>
            {links.map((l) => <a key={l.url} className="ra-nav-btn" href={l.url} target="_blank" rel="noopener noreferrer"><Icon name="link" /><span>{l.label}</span></a>)}
          </div>
        )}
      </nav>
      <div className="rp-side-foot"><ThemeToggle className="ra-nav-btn" label /></div>
      <form action={logoutAction.bind(null, portal)}><button className="ra-nav-btn" type="submit"><Icon name="arrow" /><span>Sign out</span></button></form>
    </aside>
  );
}
