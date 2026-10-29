'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Puts the highlight `hl` (absolutely placed inside `box`) over `to` at once, then slides it there from where it was, by
 * transform only. With reduced motion it fades in place instead.
 */
export function glideTo(hl: HTMLElement, box: HTMLElement, to: Element, animate: boolean) {
  const b = box.getBoundingClientRect(), r = to.getBoundingClientRect();
  const now = [r.left - b.left + box.scrollLeft, r.top - b.top + box.scrollTop, r.width, r.height];
  const old = hl.dataset.at?.split(',').map(Number);
  Object.assign(hl.style, { left: `${now[0]}px`, top: `${now[1]}px`, width: `${now[2]}px`, height: `${now[3]}px`, opacity: '' });
  hl.dataset.at = now.join();
  if (!animate || !old || old.join() === now.join() || !now[2]) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { hl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return; }
  hl.animate([
    { transform: `translate(${old[0]! - now[0]!}px, ${old[1]! - now[1]!}px) scale(${old[2]! / now[2]!}, ${old[3]! / now[3]!})` },
    { transform: 'none' }
  ], { duration: 280, easing: EASE });
}

/**
 * A sidebar's highlight: one element that slides to the link marked aria-current="page" whenever `path` changes.
 * Until the script runs (and with no current link) each link draws its own highlight; .has-hl turns that off.
 */
export function useSideGlide(path: string) {
  const box = useRef<HTMLElement>(null);
  const hl = useRef<HTMLSpanElement>(null);
  const place = (animate: boolean) => {
    const b = box.current, h = hl.current;
    if (!b || !h) return;
    const cur = b.querySelector('[aria-current="page"]');
    b.classList.toggle('has-hl', !!cur);
    if (cur) glideTo(h, b, cur, animate); else delete h.dataset.at;
  };
  useLayoutEffect(() => place(true), [path]);
  useEffect(() => {
    // The sidebar changes size with the window (and turns into a row of links on narrow screens): follow without sliding.
    const ro = new ResizeObserver(() => place(false));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return { box, hl };
}

/**
 * Section tabs and filter chips (.ra-filters): pressing one slides a single dark pill from the current one to it.
 * Mounted once for the whole app; it adds the pill to a row the first time one of its chips is pressed, and follows the row's
 * current chip after that (Back, keyboard, or the page changing it).
 */
export function FilterPills() {
  useEffect(() => {
    const current = (row: Element) => row.querySelector('.ra-filter[aria-current="page"], .ra-filter[aria-pressed="true"]');
    const onClick = (e: MouseEvent) => {
      const f = (e.target as Element).closest?.('.ra-filters > .ra-filter');
      if (!f || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const row = f.parentElement!, cur = current(row);
      if (!cur || cur === f) return;
      let pill = row.querySelector<HTMLElement>(':scope > .ra-fpill');
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'ra-fpill';
        pill.setAttribute('aria-hidden', 'true');
        row.append(pill);
        glideTo(pill, row as HTMLElement, cur, false);
        row.classList.add('has-pill');
        const p = pill;
        const mo = new MutationObserver(() => { const c = current(row); if (c) glideTo(p, row as HTMLElement, c, true); });
        mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'aria-pressed'] });
      }
      glideTo(pill, row as HTMLElement, f, true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
