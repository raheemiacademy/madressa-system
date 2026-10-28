'use client';

import { useEffect } from 'react';

/*
 * The marketing pages' motion (your requests, 28/10/2026; previewed in screenshots/website-preview). Motion only: every page
 * reads and works without it. With reduced motion there is no snapping, no pinning and no demos; links still land mid-screen.
 *  - Section entrances: an element already on screen when the page loads never animates; the rest get .rise just before they
 *    scroll into view (marketing.css).
 *  - In-page links land their section in the middle of the screen (or at the top, under the header, when it's taller).
 *  - Gentle snap: when the visitor stops scrolling close to a section's resting place, it settles there.
 *  - The menu's pill follows the pointer.
 *  - "One evening": pinned while the clock runs through the chapters (wide, tall enough screens only).
 *  - Section headings light up word by word as they scroll in.
 *  - The fire drill and the three phones demonstrate themselves while on screen.
 */
const DIGIT = /\d/g;
const digits = (text: string) => text.replace(DIGIT, (n) => `<span class="dg">${n}</span>`);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Motion() {
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const off: (() => void)[] = [];
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      addEventListener(type, fn, opts); off.push(() => removeEventListener(type, fn, opts));
    };
    const head = () => { const h = document.querySelector<HTMLElement>('.ms .site-head'); return h && getComputedStyle(h).position === 'sticky' ? h.offsetHeight : 0; };

    // Entrances
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('rise'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px 15% 0px' });
    document.querySelectorAll<HTMLElement>('.ms [data-rise]').forEach((el) => { if (el.getBoundingClientRect().top >= innerHeight) io.observe(el); });
    off.push(() => io.disconnect());

    // Where a section comes to rest: its content centred in the space under the header, or its top under the header if it's taller.
    const restY = (el: HTMLElement) => {
      const h = head(), pin = el.matches('.tour');
      const box = pin ? el : el.querySelector<HTMLElement>(':scope > .wrap') ?? el;
      const r = box.getBoundingClientRect(), y = r.top + scrollY, room = innerHeight - h;
      return pin || r.height > room - 32 ? y - h - (pin ? 0 : 16) : y + r.height / 2 - (h + room / 2);
    };
    let steering = 0; // when we last scrolled the page ourselves
    const go = (el: HTMLElement) => { steering = Date.now(); scrollTo({ top: Math.max(0, restY(el)), behavior: reduce ? 'auto' : 'smooth' }); };
    const target = (a: HTMLAnchorElement) => {
      const url = new URL(a.href);
      if (url.pathname !== location.pathname || !url.hash) return null;
      return document.getElementById(decodeURIComponent(url.hash.slice(1)));
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.<HTMLAnchorElement>('.ms a[href*="#"]');
      const el = a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey ? target(a) : null;
      if (!el) return;
      e.preventDefault();
      history.pushState(null, '', `#${el.id}`);
      go(el);
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    };
    document.addEventListener('click', onClick); off.push(() => document.removeEventListener('click', onClick));
    if (location.hash) { const el = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (el) requestAnimationFrame(() => { steering = Date.now(); scrollTo({ top: Math.max(0, restY(el)) }); }); }

    // Gentle snap, wide screens only: phones and tablets scroll freely
    if (!reduce) {
      let touched = 0, idle = 0;
      const user = () => { touched = Date.now(); };
      on('wheel', user, { passive: true }); on('touchmove', user, { passive: true });
      on('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) user(); });
      on('scroll', () => {
        clearTimeout(idle);
        idle = window.setTimeout(() => {
          if (innerWidth < 960 || Date.now() - touched > 1200 || Date.now() - steering < 1200) return;
          if (document.activeElement?.matches('input, textarea, select')) return;
          let best: number | null = null;
          for (const s of document.querySelectorAll<HTMLElement>('.ms main > section, .ms .module')) {
            const y = restY(s);
            if (best === null || Math.abs(y - scrollY) < Math.abs(best - scrollY)) best = y;
          }
          if (best !== null && Math.abs(best - scrollY) > 4 && Math.abs(best - scrollY) < innerHeight * 0.18) { steering = Date.now(); scrollTo({ top: best, behavior: 'smooth' }); }
        }, 160);
      }, { passive: true });
    }

    // The menu's pill follows the pointer
    const nav = document.querySelector<HTMLElement>('.ms .site-nav');
    if (nav && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const pill = document.createElement('span');
      pill.className = 'nav-pill'; pill.setAttribute('aria-hidden', 'true');
      nav.prepend(pill);
      const move = (a: HTMLElement | null) => {
        if (!a) { pill.style.opacity = '0'; return; }
        if (pill.style.opacity !== '1') pill.style.transition = 'none'; // appear where the pointer is, then glide
        pill.style.width = `${a.offsetWidth}px`; pill.style.transform = `translateX(${a.offsetLeft}px)`;
        void pill.offsetWidth; pill.style.transition = ''; pill.style.opacity = '1';
      };
      nav.querySelectorAll<HTMLElement>('a').forEach((a) => a.addEventListener('pointerenter', () => move(a)));
      nav.addEventListener('pointerleave', () => move(null));
    }

    if (reduce) return () => off.forEach((f) => f());

    // Headings light up word by word as they scroll in
    const lit: [HTMLElement[], HTMLElement][] = [];
    document.querySelectorAll<HTMLElement>('.ms [data-words]').forEach((h) => {
      if (h.getBoundingClientRect().top < innerHeight * 0.6) return; // already read
      const words = (h.textContent ?? '').split(' ');
      h.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
      lit.push([[...h.querySelectorAll<HTMLElement>('.w')], h]);
    });

    // "One evening", pinned: the scroll position runs the clock, picks the chapter and darkens the sky
    const tour = document.querySelector<HTMLElement>('.ms .tour');
    const run = tour?.querySelector<HTMLElement>('.tour-run');
    const clock = tour?.querySelector<HTMLElement>('.tour-clock');
    const chapters = tour ? [...tour.querySelectorAll<HTMLElement>('.tour-run .chapter')] : [];
    const STOPS = [285, 300, 310, 390, 420, 480]; // each chapter's time in minutes from midday, then 8:00
    let shown = '';
    const pinned = () => !!tour && innerWidth >= 960 && innerHeight >= 640;
    const layout = () => { tour?.classList.toggle('pinned', pinned()); tour?.style.setProperty('--head', `${head()}px`); };
    layout(); on('resize', layout);

    let frame = 0;
    const update = () => {
      frame = 0;
      for (const [ws, h] of lit) {
        const p = clamp((innerHeight * 0.9 - h.getBoundingClientRect().top) / (innerHeight * 0.4));
        ws.forEach((w, i) => w.classList.toggle('on', i < Math.ceil(p * ws.length)));
      }
      if (!tour?.classList.contains('pinned') || !run || !clock) return;
      const span = run.offsetHeight - (innerHeight - head());
      const p = clamp((head() - run.getBoundingClientRect().top) / span) * 0.9999;
      const i = Math.floor(p * chapters.length), local = p * chapters.length - i;
      const m = Math.round(STOPS[i]! + (STOPS[i + 1]! - STOPS[i]!) * local);
      const text = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
      if (text !== shown) { clock.innerHTML = digits(text); shown = text; }
      chapters.forEach((c, n) => c.classList.toggle('on', n === i));
      tour.style.setProperty('--day', String((m - 270) / 210));
      const dusk = clamp((m - 375) / 70);
      tour.style.setProperty('--dusk', String(dusk));
      tour.classList.toggle('dusk', dusk > 0.5);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    on('scroll', queue, { passive: true }); on('resize', queue); update();
    off.push(() => cancelAnimationFrame(frame));

    // Demos that play while on screen. Each run checks `live` so leaving the screen stops it.
    const demo = (el: Element | null, play: (live: () => boolean) => Promise<void>, threshold = 0.4) => {
      if (!el) return;
      let token = 0;
      const obs = new IntersectionObserver(async ([en]) => {
        const mine = ++token;
        if (!en?.isIntersecting) return;
        const live = () => token === mine;
        while (live()) { await play(live); if (live()) await wait(2400); }
      }, { threshold });
      obs.observe(el); off.push(() => { token++; obs.disconnect(); });
    };
    const count = async (els: HTMLElement[], ms: number) => {
      const t0 = performance.now();
      const ends = els.map((e) => e.dataset.to ?? e.textContent ?? '');
      while (true) {
        const t = clamp((performance.now() - t0) / ms), ease = 1 - (1 - t) ** 3;
        els.forEach((e, n) => { e.innerHTML = digits(ends[n]!.replace(/[\d,]+/, (v) => Math.round(+v.replace(/,/g, '') * ease).toLocaleString('en-GB'))); });
        if (t >= 1) return;
        await new Promise((r) => requestAnimationFrame(r));
      }
    };

    // The fire drill: a finger presses and holds, the ring fills, then the live roll call counts everyone out
    const drill = document.querySelector<HTMLElement>('.ms .frag-drill');
    demo(drill, async (live) => {
      const hold = drill!.querySelector<HTMLElement>('.hold')!;
      const counts = [...drill!.querySelectorAll<HTMLElement>('.drill-live [data-to]')];
      await wait(500); if (!live()) return;
      hold.classList.add('pressing'); await wait(2100); if (!live()) return hold.classList.remove('pressing');
      drill!.classList.add('live'); await count(counts, 1800); await wait(2200);
      drill!.classList.remove('live'); hold.classList.remove('pressing');
    });

    // The phones: the office clicks through, the teacher takes the register, a parent checks in
    const phones = document.querySelector<HTMLElement>('.ms .phones');
    const tapAt = async (phone: HTMLElement, el: HTMLElement) => {
      const p = phone.getBoundingClientRect(), r = el.getBoundingClientRect(), dot = document.createElement('span');
      dot.className = 'ph-tap'; dot.style.left = `${r.left - p.left + r.width / 2}px`; dot.style.top = `${r.top - p.top + r.height / 2}px`;
      phone.append(dot); await wait(420); dot.remove();
    };
    demo(phones, async (live) => {
      const [office, teacher, parent] = [...phones!.querySelectorAll<HTMLElement>('.phone')];
      if (!office || !teacher || !parent) return;
      const marks = [...teacher.querySelectorAll<HTMLElement>('.ph-seg i[data-mark]')];
      const save = teacher.querySelector<HTMLElement>('.ph-btn')!, toast = teacher.querySelector<HTMLElement>('.ph-toast')!;
      const opened = [...phones!.querySelectorAll<HTMLElement>('[data-demo]')];
      // Start from the beginning of the evening
      marks.forEach((m) => m.classList.remove('on', 'a')); save.classList.add('waiting'); toast.classList.remove('show'); opened.forEach((c) => c.classList.remove('open'));
      count([...office.querySelectorAll<HTMLElement>('[data-to]')], 1400);
      const cursor = office.querySelector<HTMLElement>('.ph-cursor')!;
      for (const card of office.querySelectorAll<HTMLElement>('[data-demo]')) {
        if (!live()) return;
        const o = office.getBoundingClientRect(), r = card.getBoundingClientRect();
        cursor.style.transform = `translate(${r.left - o.left + 36}px, ${r.top - o.top + 14}px)`; cursor.classList.add('show');
        await wait(800); cursor.classList.add('click'); card.classList.add('open'); await wait(260); cursor.classList.remove('click'); await wait(700);
      }
      cursor.classList.remove('show');
      for (const m of marks) {
        if (!live()) return;
        tapAt(teacher, m); await wait(150); m.classList.add('on'); if (m.dataset.mark === 'A') m.classList.add('a'); await wait(170);
      }
      if (!live()) return;
      save.classList.remove('waiting'); await wait(400); tapAt(teacher, save); await wait(180); toast.classList.add('show'); await wait(900);
      for (const card of parent.querySelectorAll<HTMLElement>('[data-demo]')) {
        if (!live()) return;
        await tapAt(parent, card); card.classList.add('open'); await wait(900);
      }
      await wait(2500);
    }, 0.35);

    return () => off.forEach((f) => f());
  }, []);
  return null;
}
