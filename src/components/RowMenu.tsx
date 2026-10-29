'use client';

import Link from 'next/link';
import { useId, useRef } from 'react';
import { Icon, type IconName } from './Icon';

export type RowAction = { href: string; label: string; aria: string; icon: IconName };

/** Places a native popover menu under its button, kept inside the window. */
export function placeUnder(btn: HTMLElement | null, menu: HTMLElement | null) {
  const b = btn?.getBoundingClientRect();
  if (!b || !menu) return;
  menu.style.top = `${Math.min(b.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, b.right - menu.offsetWidth))}px`;
}

/**
 * A row's actions: icon buttons that show on hover or focus with a mouse, and on touch screens one ⋯ button
 * that opens the same actions as a labelled menu (CSS picks which shows).
 */
export function RowActions({ name, actions }: { name: string; actions: RowAction[] }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  return (
    <>
      <span className="ra-acts icons">
        {actions.map((a) => <Link key={a.href} href={a.href} aria-label={a.aria} data-tip={a.label}><Icon name={a.icon} /></Link>)}
      </span>
      <span className="ra-acts ra-rowmenu">
        <button ref={btn} type="button" popoverTarget={id} aria-label={`Actions for ${name}`} onClick={() => requestAnimationFrame(() => placeUnder(btn.current, menu.current))}><Icon name="more" /></button>
      </span>
      <div ref={menu} id={id} popover="auto" className="ra-menu">
        <p>{name}</p>
        {actions.map((a) => <Link key={a.href} href={a.href}><Icon name={a.icon} />{a.label}</Link>)}
      </div>
    </>
  );
}
