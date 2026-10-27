'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { checkNowAction } from '../actions';
import { Icon } from './icons';
import { useToast } from './Sheet';

/** "Check now": asks every madrasah straight away instead of waiting for the next 5-minute round. */
export function CheckNow() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast, toastBox } = useToast();
  const run = () => {
    toast('Checking every madrasah now…');
    start(async () => {
      const r = await checkNowAction().catch(() => ({ error: 'That didn’t work. Check your connection and try again.' }));
      toast('error' in r && r.error ? r.error : 'Checked.');
      router.refresh();
    });
  };
  return (
    <>
      <button className="btn sm" type="button" onClick={run} disabled={pending}><Icon name="refresh" />{pending ? 'Checking…' : 'Check now'}</button>
      {toastBox}
    </>
  );
}
