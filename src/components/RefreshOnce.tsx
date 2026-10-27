'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Refreshes the page's server data once when `when` changes, e.g. so the header's unread count drops after opening a message. */
export function RefreshOnce({ when }: { when: string | number }) {
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [when, router]);
  return null;
}
