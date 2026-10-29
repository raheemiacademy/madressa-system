'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { placeUnder } from './RowMenu';

/** A page's most used tools stay as buttons; the rest sit in one "More tools" menu with a search box (native popover). */
export function MoreTools({ tools, top }: { tools: [href: string, label: string][]; top: string[] }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const rest = tools.filter(([h]) => !top.includes(h));
  const shown = rest.filter(([, l]) => l.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="ra-more">
      {top.map((h) => tools.find((t) => t[0] === h)).map((t) => t && <Link key={t[0]} className="ra-btn" href={t[0]}>{t[1]}</Link>)}
      <button ref={btn} type="button" className="ra-btn" popoverTarget={id}><Icon name="more" />More tools</button>
      <div ref={menu} id={id} popover="auto" className="ra-menu ra-tools-menu"
        onToggle={(e) => { if (e.newState === 'open') { setQ(''); placeUnder(btn.current, menu.current); menu.current?.querySelector('input')?.focus(); } }}>
        <input className="ra-input" type="search" placeholder="Find a tool" aria-label="Find a tool" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.length ? <ul>{shown.map(([h, l]) => <li key={h}><Link href={h}>{l}</Link></li>)}</ul> : <p className="ra-empty">No tools match.</p>}
      </div>
    </div>
  );
}
