'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { PRODUCT_NAME } from '@/lib/marketing';

/*
 * The hero's live thing: the dashboard during an evening of classes, and a slider through it (4:30–8:00 pm).
 * Without JavaScript the dashboard shows 5:25 pm and the slider stays hidden. With it, the evening plays on its own while it's
 * on screen: 4:30 to 8:00 in about 14 seconds, a pause at 8:00, a fade, and round again. It holds while the visitor hovers,
 * drags or tabs to it, and carries on a few seconds after they let go; the button stops it for good (WCAG 2.2.2). With reduced
 * motion it doesn't play by itself: it sits at the visitor's time (or 5:20 pm outside 4:30–8:00) until they move it.
 */
const START = 16 * 60 + 30;
const MAX = 42; // 5-minute steps from 4:30 to 8:00
const STATIC_T = 17 * 60 + 25; // what the page shows before the script runs
const STEPS_PER_SEC = 3; // the whole evening in 14 seconds
const HOLD_AT_END_MS = 2600, REWIND_FADE_MS = 320, RESUME_AFTER_MS = 4000;
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
const minuteAt = (v: number) => START + Math.floor(v * 5);

export function Evening() {
  const [v, setV] = useState<number | null>(null); // slider position in 5-minute steps (fractional while it plays); null until the script runs
  const [fresh, setFresh] = useState(0); // how many of the newest feed rows just appeared (they slide in)
  const [stopped, setStopped] = useState(false); // the pause button: off until the visitor presses Play
  const [rewinding, setRewinding] = useState(false);
  const live = useRef({ v: 0, shown: 0, visible: false, holds: new Set<string>(), resumeAt: 0, endedAt: 0 });
  const box = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  // Read by the frame loop, so it never has to restart.
  const stopRef = useRef(stopped), rewindRef = useRef(false);
  stopRef.current = stopped;

  const show = (value: number) => {
    const L = live.current, count = happened(minuteAt(value)).length;
    setFresh(Math.max(0, count - L.shown)); // only rows that are new since the last frame slide in
    L.shown = count; L.v = value;
    setV(value);
  };

  useEffect(() => {
    const L = live.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
      const at = nowMin >= START && nowMin <= 20 * 60 ? Math.round((nowMin - START) / 5) : Math.round((17 * 60 + 20 - START) / 5);
      L.shown = happened(minuteAt(at)).length; setV(at); setStopped(true);
      return;
    }
    show(0);
    const io = new IntersectionObserver((en) => { L.visible = !!en[0]?.isIntersecting; }, { threshold: 0.35 });
    io.observe(wrap.current!);
    let raf = 0, last = performance.now();
    // requestAnimationFrame is the display's clock; a background tab gets none, so the evening simply waits.
    const frame = (now: number) => {
      const dt = Math.min(now - last, 64); last = now;
      if (L.visible && !L.holds.size && now >= L.resumeAt && !stopRef.current && !rewindRef.current) {
        if (L.v < MAX) { show(Math.min(MAX, L.v + (dt / 1000) * STEPS_PER_SEC)); L.endedAt = now; }
        else if (now - L.endedAt > HOLD_AT_END_MS) {
          rewindRef.current = true; setRewinding(true); // fade the dashboard, start the evening again, fade back
          setTimeout(() => { L.shown = 0; show(0); rewindRef.current = false; setRewinding(false); }, REWIND_FADE_MS);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const hold = (why: string, on: boolean) => {
    const L = live.current;
    if (on) { L.holds.add(why); return; }
    L.holds.delete(why);
    // After dragging, give the visitor a moment with the time they chose; a hover or focus simply lets go.
    if (why === 'drag') L.resumeAt = performance.now() + RESUME_AFTER_MS;
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // The range is step="any" so it can glide; the keys still move whole 5-minute steps.
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 6, PageDown: -6 }[e.key];
    const to = step !== undefined ? Math.round(live.current.v) + step : e.key === 'Home' ? 0 : e.key === 'End' ? MAX : null;
    if (to === null) return;
    e.preventDefault();
    live.current.resumeAt = performance.now() + RESUME_AFTER_MS;
    show(Math.max(0, Math.min(MAX, to)));
  };

  const t = v === null ? STATIC_T : minuteAt(v);
  const teachers = lastAt(TEACHERS_AT, t, 0), registers = lastAt(REGISTERS_AT, t, 0), notes = lastAt(NOTES_AT, t, 2);
  const greet = t < 17 * 60 ? 'Teachers are arriving. Registers open at 5:00.'
    : registers < 8 ? `Registers are being taken in ${8 - registers}${8 - registers === 1 ? ' class.' : ' classes.'}`
    : t < 19 * 60 ? 'Every register is in. Attendance is 93.2% tonight.' : 'Classes are finishing. Reminders and reports go out.';
  const items = happened(t).slice(-4).reverse();
  const kpi = (id: string, value: string | number) => <strong id={id} key={String(value)} className={v === null ? undefined : 'kpi-tick'}>{value}</strong>;

  return (
    <div className="evening-wrap" ref={wrap}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hold('hover', true); }} onPointerLeave={() => hold('hover', false)}>
      <figure className={`browser${rewinding ? ' rewinding' : ''}`} data-ui aria-label={`The ${PRODUCT_NAME} dashboard during an evening of classes`}>
        <div className="browser-bar" aria-hidden="true"><i /><i /><i /><span>yourmadressa.madressasystem.com</span></div>
        <div className="app-shell">
          <div className="app-side" aria-hidden="true">
            <b>Madressa</b>
            <span className="on">Dashboard</span><span>Students</span><span>Classes</span><span>Register</span><span>Fees</span><span>Messages</span><span>Homework</span><span>Reports</span>
          </div>
          <div className="app-main">
            <div className="app-greet"><div>This evening</div><p id="ev-greet" key={v === null ? 'static' : greet} className={v === null ? undefined : 'greet-in'}>{v === null ? <>Every register is in. Attendance is <b>93.2%</b> tonight.</> : greet}</p></div>
            <div className="kpis">
              <div className="kpi"><small>Teachers in</small>{kpi('k-teachers', teachers)}<em id="k-teachers-em">{t >= 19 * 60 + 40 ? 'all signed out' : 'of 12 signed in'}</em></div>
              <div className="kpi"><small>Registers</small>{kpi('k-registers', registers)}<em id="k-registers-em">of 8 taken</em></div>
              <div className="kpi"><small>Attendance</small>{kpi('k-att', registers === 8 ? '93.2%' : '—')}<em id="k-att-em">{registers === 8 ? '+2.2 pts on last week' : 'after registers'}</em></div>
              <div className="kpi"><small>From parents</small>{kpi('k-notes', notes)}<em id="k-notes-em">{notes === 1 ? 'parent notice' : 'parent notices'}</em></div>
            </div>
            <div className="feed" id="ev-feed">
              <h4>Happening now</h4>
              {items.length ? items.map(([at, text], i) => (
                <div key={at} className="feed-item" data-new={i < fresh ? '' : undefined}><time>{hm24(at)}</time><span>{text}</span></div>
              )) : <p className="feed-empty">Quiet so far. The first teacher arrives soon.</p>}
            </div>
          </div>
        </div>
      </figure>
      <div className="evening" id="evening" ref={box} hidden={v === null}>
        <div className="evening-head">
          <label htmlFor="ev-range">Drag through an evening of classes</label>
          <div className="evening-now">
            <output className="evening-time" htmlFor="ev-range">{v === null ? '5:20 pm' : hhmm(t)}</output>
            <button type="button" className="evening-play" aria-label={stopped ? 'Play the evening' : 'Pause the evening'}
              onClick={() => { const next = !stopped; setStopped(next); if (!next) { live.current.resumeAt = 0; if (live.current.v >= MAX) show(0); } }}>
              {stopped
                ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></svg>
                : <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3.5" width="2.6" height="9" rx="1" fill="currentColor" /><rect x="9.4" y="3.5" width="2.6" height="9" rx="1" fill="currentColor" /></svg>}
            </button>
          </div>
        </div>
        <input id="ev-range" type="range" min={0} max={MAX} step="any" value={v ?? 10} aria-describedby="ev-help" aria-valuetext={hhmm(t)}
          style={{ '--p': `${((v ?? 10) / MAX) * 100}%` } as CSSProperties}
          onChange={(e) => { live.current.resumeAt = performance.now() + RESUME_AFTER_MS; show(Number(e.target.value)); }}
          onPointerDown={() => hold('drag', true)} onPointerUp={() => hold('drag', false)} onPointerCancel={() => hold('drag', false)} onKeyDown={onKey}
          onFocus={() => hold('focus', true)} onBlur={() => hold('focus', false)} />
        <div className="evening-ticks" aria-hidden="true"><span>4:30</span><span>5:30</span><span>6:30</span><span>7:30</span></div>
        <p id="ev-help" className="vh">Moves the dashboard through an evening from 4:30 pm to 8:00 pm. It plays by itself; the button next to the time pauses it.</p>
      </div>
    </div>
  );
}
