'use client';

import { useEffect } from 'react';

/*
 * Section entrances and the fire-drill demo. Motion only: everything is visible without this.
 * An element already on screen (or above it) when the page loads never animates; the rest get .rise just before they
 * scroll into view, which plays them in (marketing.css). The fire-drill demo loops only while it is on screen.
 */
export function Motion() {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('rise'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px 15% 0px' });
    document.querySelectorAll<HTMLElement>('.ms [data-rise]').forEach((el) => { if (el.getBoundingClientRect().top >= innerHeight) io.observe(el); });

    const hold = document.querySelector('.ms .hold');
    const holdIo = new IntersectionObserver((en) => hold?.classList.toggle('playing', !!en[0]?.isIntersecting), { threshold: 0.3 });
    if (hold) holdIo.observe(hold);
    return () => { io.disconnect(); holdIo.disconnect(); };
  }, []);
  return null;
}
