'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { PRODUCT_NAME } from '@/lib/marketing';

/*
 * The hero's live thing: the dashboard during an evening of classes, and a slider to move through it (4:30–8:00 pm, 5-minute steps).
 * Without JavaScript the dashboard shows 5:25 pm and the slider stays hidden. With it, the slider starts at the visitor's time
 * (or 5:20 pm outside 4:30–8:00) and, on first view, plays from 4:30 up to there once; any touch or key press stops it.
 */
const START = 16 * 60 + 30;
const MAX = 42;
const STATIC_T = 17 * 60 + 25; // what the page shows before the script runs
const EVENTS: [number, string][] = [
  [16 * 60 + 41, 'Ustadh Bilal Karim signed in at the kiosk'],
  [16 * 60 + 47, 'Fatima Siddiqui: “Yusuf is away today, dentist.”'],
  [16 * 60 + 58, 'Ustadha Maryam Ali signed in on her phone'],
  [17 * 60 + 4, 'Maktab 1A register taken: 27 of 28 present'],
  [17 * 60 + 12, 'Imran Chowdhury: “Zayd will be 15 minutes late.”'],
  [17 * 60 + 18, 'All 8 registers complete'],
  [17 * 60 + 25, 'Absence texts sent to 3 families'],
  [18 * 60 + 35, 'Homework set for Maktab 3B: Surah Al-Mulk, ayat 11–20'],
  [19 * 60 + 2, 'Fees reminders sent for 46 overdue invoices'],
  [19 * 60 + 40, 'Teachers signed out. Day report ready']
];
const TEACHERS_AT: [number, number][] = [[16 * 60 + 35, 2], [16 * 60 + 41, 4], [16 * 60 + 50, 7], [16 * 60 + 58, 11], [17 * 60 + 10, 12], [19 * 60 + 40, 0]];
const REGISTERS_AT: [number, number][] = [[17 * 60 + 4, 1], [17 * 60 + 8, 4], [17 * 60 + 14, 7], [17 * 60 + 18, 8]];
const NOTES_AT: [number, number][] = [[16 * 60 + 20, 2], [16 * 60 + 47, 3], [17 * 60 + 12, 4]];

const lastAt = (list: [number, number][], t: number, dflt: number) => list.reduce((v, [at, n]) => (t >= at ? n : v), dflt);
const hhmm = (m: number) => { const h = Math.floor(m / 60), mi = m % 60; return `${h > 12 ? h - 12 : h}:${mi < 10 ? '0' : ''}${mi} pm`; };
const hm24 = (m: number) => { const h = Math.floor(m / 60), mi = m % 60; return `${h}:${mi < 10 ? '0' : ''}${mi}`; };
const happened = (t: number) => EVENTS.filter(([at]) => at <= t);

export function Evening() {
  const [v, setV] = useState<number | null>(null); // slider position; null until the script runs
  const [fresh, setFresh] = useState(0); // how many of the newest feed rows just appeared (they slide in)
  const shown = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const show = useCallback((value: number, fromUser: boolean) => {
    const count = happened(START + value * 5).length;
    setFresh(fromUser ? Math.max(0, count - shown.current) : 0);
    shown.current = count;
    setV(value);
  }, []);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  useEffect(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startVal = nowMin >= START && nowMin <= 20 * 60 ? Math.round((nowMin - START) / 5) : Math.round((17 * 60 + 20 - START) / 5);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { show(startVal, false); return; }
    show(0, false);
    let played = false;
    const io = new IntersectionObserver((en) => {
      if (!en[0]?.isIntersecting || played) return;
      played = true; io.disconnect();
      let x = 0;
      timer.current = setInterval(() => { x++; show(x, true); if (x >= startVal) stop(); }, 90);
    }, { threshold: 0.4 });
    io.observe(box.current!);
    return () => { io.disconnect(); stop(); };
  }, [show]);

  const t = v === null ? STATIC_T : START + v * 5;
  const teachers = lastAt(TEACHERS_AT, t, 0), registers = lastAt(REGISTERS_AT, t, 0), notes = lastAt(NOTES_AT, t, 2);
  const greet = t < 17 * 60 ? 'Teachers are arriving. Registers open at 5:00.'
    : registers < 8 ? `Registers are being taken in ${8 - registers}${8 - registers === 1 ? ' class.' : ' classes.'}`
    : t < 19 * 60 ? 'Every register is in. Attendance is 93.2% tonight.' : 'Classes are finishing. Reminders and reports go out.';
  const items = happened(t).slice(-4).reverse();

  return (
    <div>
      <figure className="browser" data-ui aria-label={`The ${PRODUCT_NAME} dashboard during an evening of classes`}>
        <div className="browser-bar" aria-hidden="true"><i /><i /><i /><span>yourmadressa.madressasystem.com</span></div>
        <div className="app-shell">
          <div className="app-side" aria-hidden="true">
            <b>Madressa</b>
            <span className="on">Dashboard</span><span>Students</span><span>Classes</span><span>Register</span><span>Fees</span><span>Messages</span><span>Homework</span><span>Reports</span>
          </div>
          <div className="app-main">
            <div className="app-greet"><div>This evening</div><p id="ev-greet">{v === null ? <>Every register is in. Attendance is <b>93.2%</b> tonight.</> : greet}</p></div>
            <div className="kpis">
              <div className="kpi"><small>Teachers in</small><strong id="k-teachers">{teachers}</strong><em id="k-teachers-em">{t >= 19 * 60 + 40 ? 'all signed out' : 'of 12 signed in'}</em></div>
              <div className="kpi"><small>Registers</small><strong id="k-registers">{registers}</strong><em id="k-registers-em">of 8 taken</em></div>
              <div className="kpi"><small>Attendance</small><strong id="k-att">{registers === 8 ? '93.2%' : '—'}</strong><em id="k-att-em">{registers === 8 ? '+2.2 pts on last week' : 'after registers'}</em></div>
              <div className="kpi"><small>From parents</small><strong id="k-notes">{notes}</strong><em id="k-notes-em">{notes === 1 ? 'parent notice' : 'parent notices'}</em></div>
            </div>
            <div className="feed" id="ev-feed" aria-live="polite">
              <h4>Happening now</h4>
              {items.length ? items.map(([at, text], i) => (
                <div key={at} className="feed-item" data-new={i < fresh ? '' : undefined}><time>{hm24(at)}</time><span>{text}</span></div>
              )) : <p className="feed-empty">Quiet so far. The first teacher arrives soon.</p>}
            </div>
          </div>
        </div>
      </figure>
      <div className="evening" id="evening" ref={box} hidden={v === null}>
        <div className="evening-head"><label htmlFor="ev-range">Drag through an evening of classes</label><output className="evening-time" htmlFor="ev-range">{v === null ? '5:20 pm' : hhmm(t)}</output></div>
        <input id="ev-range" type="range" min={0} max={MAX} step={1} value={v ?? 10} aria-describedby="ev-help" aria-valuetext={hhmm(t)}
          style={{ '--p': `${((v ?? 10) / MAX) * 100}%` } as CSSProperties}
          onChange={(e) => show(Number(e.target.value), true)} onPointerDown={stop} onKeyDown={stop} />
        <div className="evening-ticks" aria-hidden="true"><span>4:30</span><span>5:30</span><span>6:30</span><span>7:30</span></div>
        <p id="ev-help" className="vh">Moves the dashboard through an evening from 4:30 pm to 8:00 pm.</p>
      </div>
    </div>
  );
}
