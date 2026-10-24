import Link from 'next/link';
import type { ReactNode } from 'react';

/** Portal screen header: optional back link, a small kicker line, the title, and an optional action on the right. */
export function PortalHead({ title, kicker, back, children }: { title: string; kicker?: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <header className="rp-head">
      {back && (
        <Link className="rp-back tap" href={back} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
      )}
      <div>{kicker && <small>{kicker}</small>}<h1>{title}</h1></div>
      {children}
    </header>
  );
}
