'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { HIDE_FEES_COOKIE } from '@/lib/hide-fees';

/**
 * "Hide fees" for a screen people can see over your shoulder: hides money on the dashboard and the Fees page on this
 * device. The pages leave the figures out on the server, so nothing is in the page to read.
 */
export function HideFeesToggle({ hidden, className }: { hidden: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const flip = () => {
    document.cookie = hidden ? `${HIDE_FEES_COOKIE}=; path=/; max-age=0; samesite=lax` : `${HIDE_FEES_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <button type="button" className={className} onClick={flip} disabled={pending}>
      <Icon name={hidden ? 'eye' : 'eyeOff'} />{hidden ? 'Show fees' : 'Hide fees'}
    </button>
  );
}
