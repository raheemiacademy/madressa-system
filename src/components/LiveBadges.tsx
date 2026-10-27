'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { chime } from '@/lib/chime';

type Counts = { messages: number; notifications: number };

/**
 * Keeps the bell and message badges current without reloading: asks the server every 20 seconds while the tab is open,
 * refreshes the page's counts when they change, and chimes when something new arrives (messages, holiday requests, parent notices).
 */
export function LiveBadges({ url, counts }: { url: string; counts: Counts }) {
  const router = useRouter();
  const last = useRef(counts);
  useEffect(() => { last.current = counts; }, [counts]);
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) return;
        const now = (await r.json()) as Counts;
        const before = last.current;
        if (now.messages === before.messages && now.notifications === before.notifications) return;
        if (now.messages > before.messages || now.notifications > before.notifications) chime();
        last.current = now;
        router.refresh();
      } catch { /* offline: try again next time */ }
    };
    const t = setInterval(check, 20_000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [url, router]);
  return null;
}
