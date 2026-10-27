import type { CSSProperties } from 'react';

/** Entrance stagger step for an element with data-rise (80ms each). */
export const d = (n: number) => ({ '--d': n }) as CSSProperties;

/** A mock-up colour from the palette: avatar background (--g) or chip dot (--c). */
export const tone = (prop: '--g' | '--c', token: 'indigo' | 'action' | 'violet' | 'blue' | 'muted' | 'bad' | 'ok') => ({ [prop]: `var(--${token})` }) as CSSProperties;

/** The khatam (eight-point star) pattern behind the hero and the footer. */
export function Pattern({ id }: { id: string }) {
  return (
    <svg className="pattern" aria-hidden="true" width="100%" height="100%">
      <defs><pattern id={id} width="112" height="112" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth="2"><rect x="32" y="32" width="48" height="48" /><rect x="32" y="32" width="48" height="48" transform="rotate(45 56 56)" /><path d="M0 56h22M90 56h22M56 0v22M56 90v22" /></g></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
