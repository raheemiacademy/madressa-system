'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';

/** The not-found page's way out: home for the part of the app the address was in (teacher, parent, student or admin), or Back. */
export function HomeButtons() {
  const portal = /^\/(teacher|parent|student)(\/|$)/.exec(usePathname())?.[1] ?? 'admin';
  return (
    <div className="ra-toolbar" style={{ justifyContent: 'center' }}>
      <Link className="ra-btn primary" href={`/${portal}`}><Icon name="home" />Go to your home page</Link>
      <button type="button" className="ra-btn" onClick={() => history.back()}>Back</button>
    </div>
  );
}
