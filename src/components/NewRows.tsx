'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Motion for an inbox the server refreshes (LiveBadges checks every 20 seconds): conversations that arrive at the top drop
 * in and their unread count pops once; the ones already there slide to their new place. The list's rows carry data-id.
 */
export function NewRows({ list, ids }: { list: string; ids: string }) {
  const seen = useRef<Map<string, number>>(null);
  useLayoutEffect(() => {
    const ul = document.getElementById(list);
    if (!ul) return;
    const rows = [...ul.querySelectorAll<HTMLElement>(':scope > li[data-id]')];
    const top = ul.getBoundingClientRect().top;
    const now = new Map(rows.map((r) => [r.dataset.id!, r.getBoundingClientRect().top - top]));
    const before = seen.current;
    seen.current = now;
    if (!before || !rows.some((r) => before.has(r.dataset.id!))) return; // first view, or a different list altogether
    const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let atTop = true; // only rows above every known one are arrivals; others appearing lower down came from a filter
    for (const r of rows) {
      const was = before.get(r.dataset.id!);
      if (was === undefined) {
        if (!atTop) continue;
        r.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: still ? 200 : 260, easing: ease });
        if (!still) r.querySelector('.ra-msg-count, .ra-dot')?.animate([{ transform: 'none' }, { transform: 'scale(1.3)', offset: 0.4 }, { transform: 'none' }], { duration: 300, easing: ease });
      } else {
        atTop = false;
        const d = was - now.get(r.dataset.id!)!;
        if (d && !still) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 260, easing: ease });
      }
    }
  }, [list, ids]);
  return null;
}
