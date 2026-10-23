'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTION_GROUPS } from './sections';

export function SettingsNav() {
  const pathname = usePathname();
  const cur = (href: string) => (pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined);
  return (
    <nav aria-label="Settings sections" className="ra-card ra-sections ra-settings-nav">
      {SECTION_GROUPS.map((g) => (
        <div key={g.group}>
          <h3>{g.group}</h3>
          {g.items.map((s) => <Link key={s.href} href={s.href} aria-current={cur(s.href)}>{s.label}</Link>)}
        </div>
      ))}
    </nav>
  );
}
