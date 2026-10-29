'use client';

import { useLayoutEffect, useState } from 'react';
import { figureAt } from '@/lib/count-up';

/**
 * A dashboard figure that counts up from 0 on the first view of the session (900ms, ease-out cubic).
 * Fraunces has no tabular figures, so every digit sits in an equal-width slot and nothing shifts while counting.
 */
export function KpiValue({ value, animate }: { value: string; animate: boolean }) {
  const [shown, setShown] = useState(value);
  useLayoutEffect(() => {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 900); setShown(figureAt(value, p)); if (p < 1) raf = requestAnimationFrame(step); };
    setShown(figureAt(value, 0));
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);
  return (
    <>
      <span aria-hidden="true">{shown.split(/(\d)/).map((c, i) => c && (/\d/.test(c) ? <span key={i} className="dg">{c}</span> : c))}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}
