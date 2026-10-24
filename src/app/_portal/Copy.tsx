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
