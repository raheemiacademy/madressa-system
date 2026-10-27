import type { ReactNode } from 'react';
import { Pattern } from './bits';

/** The dark opening band of an inner page: title and lede on the left, `children` (jump links, today's date) on the right. */
export function PageHero({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <section className="page-hero field-ink on-ink" aria-labelledby="page-title">
      <Pattern id="khatam-hero" />
      <div className="wrap">
        <div className="page-hero-copy">
          <h1 id="page-title">{title}</h1>
          <p className="lede">{lede}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
