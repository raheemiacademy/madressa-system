'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/Icon';

export type Tab = { href: string; label: string; icon: IconName; badge?: number };

/**
 * Bottom tab bar (DESIGN.md: ≤5 tabs, 44px+ targets). The first tab is the portal's home and only matches exactly.
 * The current tab's highlight (the pill behind its icon and the bar above) is one element that slides, stretching a
 * little, to the tab you press. Until the script runs, each tab draws its own highlight.
 */
export function TabBar({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  const current = (t: Tab, i: number) => (i === 0 ? path === t.href : path === t.href || path.startsWith(`${t.href}/`));
  const list = useRef<HTMLUListElement>(null);
  const hl = useRef<HTMLLIElement>(null);
  const at = useRef<number | null>(null);
  const moveTo = (tab: Element | null | undefined, animate: boolean) => {
    const ul = list.current, h = hl.current;
    if (!ul || !h) return;
    ul.parentElement?.classList.add('has-hl');
    const icon = tab?.querySelector('svg')?.getBoundingClientRect();
    if (!icon) { h.style.opacity = '0'; at.current = null; return; }
    const box = ul.getBoundingClientRect();
    const x = icon.left - box.left + (icon.width - 44) / 2, y = icon.top - box.top + (icon.height - 28) / 2, to = `translate(${x}px, ${y}px)`;
    if (animate && at.current !== null && at.current !== x) {
      const x0 = at.current;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      h.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [
        { transform: `translate(${x0}px, ${y}px)` },
        { transform: `translate(${(x0 + x) / 2}px, ${y}px) scaleX(${1 + Math.min(0.6, Math.abs(x - x0) / 160)})`, offset: 0.5 },
        { transform: to },
      ], { duration: still ? 200 : 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    h.style.transform = to;
    h.style.opacity = '';
    at.current = x;
  };
  const currentTab = () => list.current?.querySelector('[aria-current="page"]');
  useLayoutEffect(() => moveTo(currentTab(), true), [path]);
  useEffect(() => {
    // Rotating the phone or the bar appearing (it's hidden on wide screens) moves the tabs: follow without animating.
    const ro = new ResizeObserver(() => moveTo(currentTab(), false));
    if (list.current) ro.observe(list.current);
    return () => ro.disconnect();
  }, []);
  return (
    <nav className="rp-tabs" aria-label="Main">
      <ul ref={list}>
        {tabs.map((t, i) => (
          <li key={t.href}>
            <Link className="rp-tab" href={t.href} aria-current={current(t, i) ? 'page' : undefined}
              onClick={(e) => { if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button)) moveTo(e.currentTarget, true); }}>
              <Icon name={t.icon} />{t.label}
              {!!t.badge && <span className="rp-badge" aria-label={`${t.badge} unread`}>{t.badge}</span>}
            </Link>
          </li>
        ))}
        <li ref={hl} className="rp-tab-hl" aria-hidden="true" />
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
