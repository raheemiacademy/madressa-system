'use client';

import * as d3 from 'd3';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatPence } from '@/lib/money';

// Ported from design-reference/dashboard/index.html (attendanceChart). Colours come from CSS variables.
const css = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();
const pct1 = (v: number) => `${v.toFixed(1)}%`;
const dayFmt = d3.utcFormat('%-d %b');

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(600);
  // Measure before the first draw, so a chart never flashes at the default width on a narrow screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(260, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Tip({ tip }: { tip: { x: number; y: number; title: string; lines: string[] } | null }) {
  if (!tip) return null;
  return (
    <div className="ra-tip" style={{ left: tip.x, top: tip.y, opacity: 1 }} role="presentation">
      <div className="t">{tip.title}</div>{tip.lines.map((l) => <div key={l} className="l">{l}</div>)}
    </div>
  );
}

/** Weekly attendance line (Register "Attendance trend" and the dashboard). */
export function TrendChart({ data, empty = 'No registers taken yet this term.', animate = false }: { data: { week: string; rate: number }[]; empty?: string; animate?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = useWidth(box);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const H = 230;
  useEffect(() => {
    const el = svg.current;
    if (!el || !data.length) return;
    const s = d3.select(el);
    s.selectAll('*').remove();
    const rows = data.map((r) => ({ d: new Date(`${r.week}T00:00:00Z`), v: r.rate }));
    const indigo = css(el, '--ra-indigo'), blue = css(el, '--ra-blue'), violet = css(el, '--ra-violet');
    const lo = Math.max(0, Math.floor(((d3.min(rows, (r) => r.v) ?? 90) - 2) / 2) * 2);
    const y = d3.scaleLinear([lo, 100], [H - 26, 10]);
    const yt = y.ticks(5);
    const ml = 44, last = rows[rows.length - 1]!, mr = 56;
    const ext = d3.extent(rows, (r) => r.d) as [Date, Date];
    if (+ext[0] === +ext[1]) { ext[0] = d3.utcDay.offset(ext[0], -3); ext[1] = d3.utcDay.offset(ext[1], 3); }
    const x = d3.scaleUtc(ext, [ml, W - mr]);
    s.append('g').selectAll('line').data(yt).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', 'var(--ra-chart-grid)');
    s.append('g').selectAll('text').data(yt).join('text').attr('x', ml - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => `${d}%`);
    const step = Math.ceil(rows.length / Math.max(2, Math.min(rows.length, Math.floor((W - ml - mr) / 70))));
    s.append('g').selectAll('text').data(rows.filter((_, i) => i % step === 0)).join('text').attr('x', (d) => x(d.d)).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => dayFmt(d.d));
    const grad = s.append('defs').append('linearGradient').attr('id', 'ra-trend-grad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    [[0, 0.32], [0.5, 0.1], [1, 0]].forEach(([o, a]) => grad.append('stop').attr('offset', o!).attr('style', `stop-color:${blue};stop-opacity:${a}`));
    s.append('path').datum(rows).attr('class', animate ? 'ra-draw-after' : null).attr('fill', 'url(#ra-trend-grad)').attr('d', d3.area<{ d: Date; v: number }>().x((d) => x(d.d)).y0(y(lo)).y1((d) => y(d.v)));
    // First view of the dashboard: the line draws in, then its end dot and label fade in (DESIGN.md Motion).
    const line = s.append('path').datum(rows).attr('class', animate ? 'ra-draw' : null).attr('fill', 'none').attr('stroke', indigo).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('d', d3.line<{ d: Date; v: number }>().x((d) => x(d.d)).y((d) => y(d.v)));
    if (animate) line.style('--len', String((line.node() as SVGPathElement).getTotalLength()));
    s.append('circle').attr('class', animate ? 'ra-draw-after' : null).attr('cx', x(last.d)).attr('cy', y(last.v)).attr('r', 4).attr('fill', indigo);
    s.append('text').attr('class', animate ? 'ra-strong ra-draw-after' : 'ra-strong').attr('x', x(last.d) + 8).attr('y', y(last.v) + 4).text(pct1(last.v));
    const hov = s.append('circle').attr('r', 5).attr('fill', violet).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2).style('opacity', 0);
    s.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - mr)).attr('height', H).attr('fill', 'transparent')
      .on('mousemove', (ev: MouseEvent) => {
        const [mx] = d3.pointer(ev); const t = x.invert(mx);
        const r = rows.reduce((a, b) => (Math.abs(+b.d - +t) < Math.abs(+a.d - +t) ? b : a));
        hov.attr('cx', x(r.d)).attr('cy', y(r.v)).style('opacity', 1);
        setTip({ x: Math.min(W - 150, x(r.d) + 12), y: Math.max(0, y(r.v) - 50), title: `Week of ${dayFmt(r.d)}`, lines: [`${pct1(r.v)} attendance`] });
      })
      .on('mouseleave', () => { hov.style('opacity', 0); setTip(null); });
  }, [data, W, animate]);
  if (!data.length) return <div className="ra-chart"><p className="ra-empty">{empty}</p></div>;
  return (
    <div ref={box} className="ra-chart" style={{ minHeight: H }}>
      <svg ref={svg} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly attendance: ${data.map((r) => `${dayFmt(new Date(`${r.week}T00:00:00Z`))} ${pct1(r.rate)}`).join(', ')}`} />
      <Tip tip={tip} />
    </div>
  );
}

type MonthRow = { month: string; present: number; late: number; authorised: number; unauthorised: number };
const series = [['present', 'Present', '--ra-blue'], ['late', 'Late', '--ra-sky'], ['authorised', 'Authorised absence', '--ra-lav'], ['unauthorised', 'Unauthorised absence', '--ra-violet']] as const;

/** Student record: 12 months of sessions by outcome; stacked or grouped bars, or lines / steps of the attendance %. */
export function MonthChart({ data }: { data: MonthRow[] }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = useWidth(box);
  const [kind, setKind] = useState<'stacked' | 'grouped' | 'line' | 'step'>('stacked');
  const H = 240;
  useEffect(() => {
    const el = svg.current;
    if (!el || !data.length) return;
    const s = d3.select(el);
    s.selectAll('*').remove();
    const mf = d3.utcFormat('%b');
    const months = data.map((r) => ({ ...r, d: new Date(`${r.month}-01T00:00:00Z`), total: r.present + r.late + r.authorised + r.unauthorised }));
    const ml = 40, mb = 26;
    const xb = d3.scaleBand(months.map((m) => mf(m.d)), [ml, W - 8]).padding(0.25);
    s.append('g').selectAll('text').data(months).join('text').attr('x', (m) => xb(mf(m.d))! + xb.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((m) => mf(m.d));
    if (kind === 'line' || kind === 'step') {
      const pts = months.filter((m) => m.total).map((m) => ({ x: xb(mf(m.d))! + xb.bandwidth() / 2, v: ((m.present + m.late) / m.total) * 100 }));
      const y = d3.scaleLinear([Math.max(0, Math.floor(((d3.min(pts, (p) => p.v) ?? 80) - 5) / 10) * 10), 100], [H - mb, 10]);
      s.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => `${d}%`);
      s.append('path').datum(pts).attr('fill', 'none').attr('stroke', css(el, '--ra-indigo')).attr('stroke-width', 2)
        .attr('d', d3.line<{ x: number; v: number }>().x((p) => p.x).y((p) => y(p.v)).curve(kind === 'step' ? d3.curveStepAfter : d3.curveLinear));
      s.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => y(p.v)).attr('r', 3.5).attr('fill', css(el, '--ra-indigo'));
      return;
    }
    const max = kind === 'stacked' ? d3.max(months, (m) => m.total) ?? 1 : d3.max(months, (m) => Math.max(m.present, m.late, m.authorised, m.unauthorised)) ?? 1;
    const y = d3.scaleLinear([0, Math.max(1, max)], [H - mb, 10]).nice();
    s.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => String(d));
    const inner = d3.scaleBand(series.map((x) => x[0]), [0, xb.bandwidth()]).padding(0.1);
    for (const m of months) {
      let acc = 0;
      for (const [k, , c] of series) {
        const v = m[k];
        if (!v) continue;
        const colour = css(el, c);
        if (kind === 'stacked') { s.append('rect').attr('x', xb(mf(m.d))!).attr('width', xb.bandwidth()).attr('y', y(acc + v)).attr('height', y(acc) - y(acc + v)).attr('fill', colour); acc += v; }
        else s.append('rect').attr('x', xb(mf(m.d))! + inner(k)!).attr('width', inner.bandwidth()).attr('y', y(v)).attr('height', y(0) - y(v)).attr('rx', 2).attr('fill', colour);
      }
    }
  }, [data, W, kind]);
  if (!data.some((d) => d.present + d.late + d.authorised + d.unauthorised)) return <p className="ra-empty">No register entries in this period.</p>;
  return (
    <div>
      <div className="ra-toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="ra-legend">{series.map(([k, l, c]) => <span key={k}><i style={{ background: `var(${c})` }} />{l}</span>)}</div>
        <div className="ra-filters" role="group" aria-label="Chart style">
          {(['stacked', 'grouped', 'line', 'step'] as const).map((k) => <button key={k} type="button" className="ra-filter" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'stacked' ? 'Stacked' : k === 'grouped' ? 'Bars' : k === 'line' ? 'Line' : 'Steps'}</button>)}
        </div>
      </div>
      <div ref={box} className="ra-chart" style={{ minHeight: H }}>
        <svg ref={svg} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Sessions by month: ${data.map((r) => `${r.month} ${r.present} present, ${r.late} late, ${r.authorised} authorised and ${r.unauthorised} unauthorised absences`).join('; ')}`} />
      </div>
    </div>
  );
}

/** Fees dashboard: invoiced vs received per month (pence), grouped bars. Ported from the design's feesMonthlyChart. */
export function FeesChart({ data }: { data: { month: string; invoiced: number; received: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = useWidth(box);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const H = 240;
  const any = data.some((d) => d.invoiced || d.received);
  useEffect(() => {
    const el = svg.current;
    if (!el || !any) return;
    const s = d3.select(el);
    s.selectAll('*').remove();
    const rows = data.map((r) => ({ m: new Date(`${r.month}-01T00:00:00Z`), inv: r.invoiced / 100, rec: r.received / 100 }));
    const lav = css(el, '--ra-lav'), indigo = css(el, '--ra-indigo');
    const y = d3.scaleLinear([0, Math.max(1, d3.max(rows, (r) => Math.max(r.inv, r.rec)) ?? 1)], [H - 26, 10]).nice();
    const yt = y.ticks(4);
    const comp = (v: number) => `£${Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`;
    const ml = 48, mf = d3.utcFormat('%b');
    const xb = d3.scaleBand(rows.map((r) => mf(r.m)), [ml, W - 4]).padding(0.28);
    const inner = d3.scaleBand(['inv', 'rec'], [0, xb.bandwidth()]).padding(0.12);
    s.append('g').selectAll('line').data(yt).join('line').attr('x1', ml).attr('x2', W - 4).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', 'var(--ra-chart-grid)');
    s.append('g').selectAll('text').data(yt).join('text').attr('x', ml - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(comp);
    rows.forEach((r, i) => {
      const x0 = xb(mf(r.m))!, bw = Math.min(32, inner.bandwidth());
      const show = () => setTip({ x: Math.min(W - 170, x0 + xb.bandwidth()), y: 10, title: d3.utcFormat('%B %Y')(r.m), lines: [`Invoiced ${formatPence(data[i]!.invoiced)}`, `Received ${formatPence(data[i]!.received)}`] });
      ([['inv', r.inv, lav], ['rec', r.rec, indigo]] as const).forEach(([k, v, c]) => {
        s.append('rect').attr('x', x0 + inner(k)! + (inner.bandwidth() - bw) / 2).attr('y', y(v)).attr('width', bw).attr('height', Math.max(0, y(0) - y(v))).attr('rx', 4).attr('fill', c)
          .on('mousemove', show).on('mouseleave', () => setTip(null));
      });
      s.append('text').attr('x', x0 + xb.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text(mf(r.m));
    });
  }, [data, W, any]);
  if (!any) return <div className="ra-chart"><p className="ra-empty">No invoices in the last six months.</p></div>;
  return (
    <div ref={box} className="ra-chart" style={{ minHeight: H }}>
      <svg ref={svg} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Invoiced and received by month: ${data.map((r) => `${d3.utcFormat('%B')(new Date(`${r.month}-01T00:00:00Z`))} ${formatPence(r.invoiced)} invoiced, ${formatPence(r.received)} received`).join('; ')}`} />
      <Tip tip={tip} />
    </div>
  );
}

type HBar = { label: string; segs: { name: string; value: number; colour: string }[]; end: string; strong?: boolean; tip: string[] };

/** Horizontal stacked bars, one per row (dashboard "Students by age group" and "Fees by type"). Ported from the design's ageChart/feesTypeChart. */
export function HBarChart({ rows, label, empty, track = false, animate = false }: { rows: HBar[]; label: string; empty: string; track?: boolean; animate?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = useWidth(box);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const H = Math.max(160, rows.length * 36 + 12);
  useEffect(() => {
    const el = svg.current;
    if (!el || !rows.length) return;
    const s = d3.select(el);
    s.selectAll('*').remove();
    const textW = (t: string, cls?: string) => { const n = s.append('text').attr('class', cls ?? null).text(t); const w = (n.node() as SVGTextElement).getComputedTextLength(); n.remove(); return w; };
    const total = (r: HBar) => r.segs.reduce((a, g) => a + g.value, 0);
    const ml = (d3.max(rows, (r) => textW(r.label)) ?? 0) + 10;
    const mr = (d3.max(rows, (r) => textW(r.end, 'ra-strong')) ?? 0) + 10;
    const yb = d3.scaleBand(rows.map((r) => r.label), [6, H - 6]).padding(0.35);
    let k = 0; // bar order, for the 40ms grow stagger
    const x = d3.scaleLinear([0, Math.max(1, d3.max(rows, total) ?? 1)], [ml, Math.max(ml + 20, W - mr)]);
    rows.forEach((r) => {
      const yy = yb(r.label)!, bh = Math.min(22, yb.bandwidth()), off = (yb.bandwidth() - bh) / 2, mid = yy + yb.bandwidth() / 2 + 4;
      const show = (ev: MouseEvent) => { const [mx, my] = d3.pointer(ev, el); setTip({ x: Math.min(W - 170, mx + 12), y: Math.max(0, my - 50), title: r.label, lines: r.tip }); };
      s.append('text').attr('x', ml - 8).attr('y', mid).attr('text-anchor', 'end').text(r.label);
      if (track && total(r)) s.append('rect').attr('class', animate ? 'ra-grow' : null).style('--i', String(k++)).attr('x', ml).attr('y', yy + off).attr('height', bh).attr('width', Math.max(2, x(total(r)) - ml)).attr('rx', 4).attr('fill', `color-mix(in srgb, ${css(el, '--ra-lav')} 30%, transparent)`);
      let acc = 0;
      for (const g of r.segs) {
        if (!g.value) continue;
        s.append('rect').attr('class', animate ? 'ra-grow' : null).style('--i', String(k++)).attr('x', x(acc) + (acc ? 1 : 0)).attr('y', yy + off).attr('height', bh).attr('width', Math.max(2, x(acc + g.value) - x(acc) - (acc ? 1 : 0))).attr('rx', 4)
          .attr('fill', css(el, g.colour)).on('mousemove', show).on('mouseleave', () => setTip(null));
        acc += g.value;
      }
      s.append('text').attr('class', [r.strong === false ? '' : 'ra-strong', animate ? 'ra-draw-after' : ''].join(' ').trim() || null).attr('x', x(total(r)) + 6).attr('y', mid).text(r.end);
    });
  }, [rows, W, H, track, animate]);
  if (!rows.length) return <div className="ra-chart"><p className="ra-empty">{empty}</p></div>;
  return (
    <div ref={box} className="ra-chart" style={{ minHeight: H }}>
      <svg ref={svg} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} />
      <Tip tip={tip} />
    </div>
  );
}
