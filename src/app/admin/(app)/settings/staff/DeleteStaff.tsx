'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { deleteStaffAction } from './actions';

export function DeleteStaff({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <>
      <button aria-label={`Delete ${name}`} disabled={pending} onClick={() => {
        if (!confirm(`Delete ${name}? They will be signed out and can no longer log in.`)) return;
        start(async () => setError((await deleteStaffAction(id)).error ?? ''));
      }}><Icon name="trash" /></button>
      {error && <span role="alert" style={{ color: 'var(--color-bad)', fontSize: 12, whiteSpace: 'normal' }}>{error}</span>}
    </>
  );
}
