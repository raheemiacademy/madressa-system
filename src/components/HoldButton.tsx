'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hold-to-confirm (DESIGN.md motion: 2s linear fill, 200ms snap back on release; Space/Enter supported).
 * A timer, not the CSS transition, decides when the hold is complete, so reduced motion doesn't change behaviour.
 */
export function HoldButton({ onConfirm, label = 'Hold to start drill', holdingLabel = 'Keep holding…', doneLabel = 'Drill started', big = false, describedBy }: {
  onConfirm: () => void; label?: string; holdingLabel?: string; doneLabel?: string; big?: boolean; describedBy?: string;
}) {
  const [state, setState] = useState<'idle' | 'holding' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const start = () => {
    if (state !== 'idle') return;
    setState('holding');
    timer.current = setTimeout(() => { setState('done'); onConfirm(); }, 2000);
  };
  const stop = () => { if (state === 'holding') { if (timer.current) clearTimeout(timer.current); setState('idle'); } };
  return (
    <button type="button" className={`ra-drill${big ? ' big' : ''}${state === 'holding' ? ' holding' : state === 'done' ? ' done' : ''}`} aria-describedby={describedBy}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }} onContextMenu={(e) => e.preventDefault()}>
      <span>{label}</span>
      <span className="ra-drill-fill" aria-hidden="true">{state === 'done' ? doneLabel : holdingLabel}</span>
      <span className="sr-only" aria-live="assertive">{state === 'holding' ? 'Keep holding' : state === 'done' ? doneLabel : ''}</span>
    </button>
  );
}
