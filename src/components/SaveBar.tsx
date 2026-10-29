'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Result = { ok?: boolean; message?: string };

/** A working button keeps the width it had with its label, so the spinner and "Saved ✓" don't shift the row. */
export function useKeepWidth(ref: React.RefObject<HTMLButtonElement | null>, pending: boolean, done: boolean) {
  const width = useRef(0);
  useLayoutEffect(() => { if (pending && ref.current) width.current = ref.current.offsetWidth; }, [ref, pending]);
  useLayoutEffect(() => { if (ref.current) ref.current.style.minWidth = done ? `${width.current}px` : ''; }, [ref, done]);
}

/** True for 1.2 seconds after a result that worked. */
export function useDone(state?: Result) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setDone(true);
    const t = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(t);
  }, [state]);
  return done;
}

/** A spinner while it works, then "Saved ✓" for a moment if it worked (as Sign in does). */
export function SubmitButton({ pending, state, label, doneText = 'Saved ✓' }: { pending: boolean; state?: Result; label: string; doneText?: string }) {
  const done = useDone(state);
  const ref = useRef<HTMLButtonElement>(null);
  useKeepWidth(ref, pending, done);
  return (
    <button ref={ref} className={`ra-btn primary${done ? ' is-done' : ''}`} type="submit" disabled={pending || done} aria-busy={pending || undefined}>
      {done ? <span className="ok">{doneText}</span> : label}
    </button>
  );
}

export function SaveBar({ pending, state, label = 'Save changes' }: { pending: boolean; state?: Result; label?: string }) {
  return (
    <div className="ra-savebar">
      <SubmitButton pending={pending} state={state} label={label} />
      <span role="status" aria-live="polite" style={state?.ok ? undefined : { color: 'var(--color-bad)' }}>{pending ? '' : state?.message}</span>
    </div>
  );
}
