'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';

/** Search box for the Classes page: filters as you type (and still works with Enter if scripts are off). */
export function ClassSearch({ q, sort }: { q: string; sort: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  useEffect(() => {
    if (value.trim() === q) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ ...(sort !== 'custom' ? { sort } : {}), ...(value.trim() ? { q: value.trim() } : {}) }).toString();
      router.replace(`/admin/classes${qs ? `?${qs}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [value, q, sort, router]);
  return (
    <form className="ra-findbar" role="search" action="/admin/classes">
      {sort !== 'custom' && <input type="hidden" name="sort" value={sort} />}
      <Icon name="search" />
      <input className="ra-input" type="search" name="q" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" enterKeyHint="search"
        placeholder="Search classes, teachers or age groups" aria-label="Search classes" />
    </form>
  );
}
