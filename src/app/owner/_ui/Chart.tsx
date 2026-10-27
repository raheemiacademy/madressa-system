'use client';

import { useEffect, useRef, useState } from 'react';

const nf = new Intl.NumberFormat('en-GB');

/** One series, one axis, a crosshair and tooltip on hover (the prototype's chart). `limit` draws the dashed alert line. */
export function Chart({ vals, labels, h = 64, axis = false, max, limit = 0, unit = '', aria }: {
  vals: number[]; labels: string[]; h?: number; axis?: boolean; max?: number; limit?: number; unit?: string; aria: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(Math.max(120, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const top = max || Math.max(1, ...vals) * 1.15;
  const ml = axis ? 40 : 4, mr = 8, mt = 8, mb = axis ? 22 : 6;
  const x = (i: number) => ml + (vals.length === 1 ? (W - ml - mr) / 2 : (i * (W - ml - mr)) / (vals.length - 1));
  const y = (v: number) => mt + (h - mt - mb) * (1 - v / top);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = vals.length - 1;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(last, Math.round((mx - ml) / ((W - ml - mr) / Math.max(1, last))))));
  };
  const tipLeft = hover === null ? 0 : x(hover) + 10 + 120 > W ? x(hover) - 130 : x(hover) + 10;
  return (
    <div className="chart" ref={box} role="img" aria-label={aria}>
      {W > 0 && vals.length > 0 && (
        <svg viewBox={`0 0 ${W} ${h}`} height={h} preserveAspectRatio="none" onPointerMove={move} onPointerLeave={() => setHover(null)}>
          {axis && [0, 50, 100].filter((t) => t <= top).map((t) => (
            <g key={t}><line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" /><text x={ml - 8} y={y(t) + 4} textAnchor="end">{t}{unit}</text></g>
          ))}
          {axis && [...new Set([0, Math.floor(last / 2), last])].map((i, k, a) => (
            <text key={i} x={x(i)} y={h - 4} textAnchor={k === 0 && a.length > 1 ? 'start' : k === a.length - 1 && a.length > 1 ? 'end' : 'middle'}>{labels[i]}</text>
          ))}
          {limit > 0 && <><line x1={ml} x2={W - mr} y1={y(limit)} y2={y(limit)} stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x={W - mr} y={y(limit) - 5} textAnchor="end" style={{ fill: 'var(--amber-text)' }}>Alert at {limit}{unit}</text></>}
          <path d={`${line} L${x(last).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`} fill="var(--chart-fill)" />
          <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={x(last)} cy={y(vals[last]!)} r="4" fill={limit && vals[last]! >= limit ? 'var(--bad)' : 'var(--chart)'} stroke="var(--panel)" strokeWidth="2" />
          {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={mt} y2={h - mb} stroke="var(--ref)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(vals[hover]!)} r="4" fill="var(--chart)" stroke="var(--panel)" strokeWidth="2" /></>}
        </svg>
      )}
      {hover !== null && <div className="tip" style={{ left: Math.max(0, tipLeft), top: 0 }}><span>{labels[hover]}</span><b>{nf.format(vals[hover]!)}{unit}</b></div>}
    </div>
  );
}
