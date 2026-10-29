'use client';

import { useState } from 'react';

/** Copies text (e.g. bank details) to the clipboard and says so. */
export function CopyButton({ text, label = 'Copy details' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="ra-btn tap" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }, () => {})}>
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}

/** "How to pay" beside the amount: opens the bank transfer details (a <details> with this id) and brings them into view. */
export function HowToPay({ target }: { target: string }) {
  return (
    <button type="button" className="ra-btn tap" style={{ flex: 'none' }} aria-controls={target} onClick={() => {
      const d = document.getElementById(target) as HTMLDetailsElement | null;
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      d.querySelector('summary')?.focus();
    }}>How to pay</button>
  );
}
