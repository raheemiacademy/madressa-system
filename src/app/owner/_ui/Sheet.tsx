'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The confirm sheet: a centred dialog on a laptop, a bottom sheet on a phone. It closes only from Cancel, Escape or a tap on
 * the backdrop; focus stays inside while it's open and goes back to the button that opened it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current!;
    (box.querySelector<HTMLElement>('[data-autofocus]') ?? box.querySelector<HTMLElement>('input, button'))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea')];
      if (!f.length) return;
      const a = f[0]!, z = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" ref={ref}>
        <h2 id="sh-t">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** A short message at the bottom of the screen, read out by screen readers. */
export function useToast() {
  const [text, setText] = useState('');
  useEffect(() => { if (!text) return; const t = setTimeout(() => setText(''), 3600); return () => clearTimeout(t); }, [text]);
  return { toast: setText, toastBox: <div className="toast" role="status">{text}</div> };
}
