'use client';

import { useState } from 'react';

type Person = { key: string; name: string; number: string; text: string };

/**
 * A list of people, each with a button that opens WhatsApp (the app, or WhatsApp Web on a computer) with their message ready.
 * Nothing is sent by the system: the person presses send in WhatsApp. Opened rows are ticked off so it's easy to work down the list.
 */
export function WhatsAppList({ people, label }: { people: Person[]; label: string }) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  if (!people.length) return <p className="ra-empty">Nobody here has a mobile number on their record.</p>;
  return (
    <div>
      <p role="status" aria-live="polite" className="ra-note" style={{ margin: '0 0 8px' }}>{opened.size} of {people.length} opened in WhatsApp</p>
      <ul className="ra-wa-list" aria-label={label}>
        {people.map((p) => (
          <li key={p.key} data-done={opened.has(p.key) || undefined}>
            <div style={{ minWidth: 0 }}><b>{p.name || p.number}</b><div className="ra-note" style={{ overflowWrap: 'anywhere' }}>+{p.number} · {p.text.length > 90 ? `${p.text.slice(0, 90)}…` : p.text}</div></div>
            <a className={`ra-btn${opened.has(p.key) ? '' : ' primary'}`} href={`https://wa.me/${p.number}?text=${encodeURIComponent(p.text)}`} target="_blank" rel="noopener noreferrer"
              onClick={() => setOpened(new Set(opened).add(p.key))} aria-label={`Open WhatsApp to ${p.name || p.number}${opened.has(p.key) ? ' (opened)' : ''}`}>
              {opened.has(p.key) ? 'Opened ✓' : 'Open WhatsApp'}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
