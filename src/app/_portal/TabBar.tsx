'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Icon, type IconName } from '@/components/Icon';

export type Tab = { href: string; label: string; icon: IconName; badge?: number };

/** Bottom tab bar (DESIGN.md: ≤5 tabs, 44px+ targets). The first tab is the portal's home and only matches exactly. */
export function TabBar({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  const current = (t: Tab, i: number) => (i === 0 ? path === t.href : path === t.href || path.startsWith(`${t.href}/`));
  return (
    <nav className="rp-tabs" aria-label="Main">
      <ul>
        {tabs.map((t, i) => (
          <li key={t.href}>
            <Link className="rp-tab" href={t.href} aria-current={current(t, i) ? 'page' : undefined}>
              <Icon name={t.icon} />{t.label}
              {!!t.badge && <span className="rp-badge" aria-label={`${t.badge} unread`}>{t.badge}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Registers the service worker that makes the portal installable and shows an offline page. Nothing personal is cached. */
export function PwaRegister({ scope }: { scope: string }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope }).catch(() => {});
  }, [scope]);
  return null;
}
