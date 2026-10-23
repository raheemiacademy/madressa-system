'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { deleteYearAction, setCurrentAction } from './actions';

export function YearRowActions({ id, title, isCurrent }: { id: number; title: string; isCurrent: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {!isCurrent && <button className="ra-link" disabled={pending} onClick={() => start(() => setCurrentAction(id))}>Make current</button>}
      <Link className="ra-link" href={`/admin/settings/years/${id}/calendar`}>Calendar</Link>
      <span className="ra-acts">
        <Link href={`/admin/settings/years/${id}`} aria-label={`Edit ${title}`}><Icon name="edit" /></Link>
        {!isCurrent && (
          <button aria-label={`Delete ${title}`} disabled={pending} onClick={() => {
            if (!confirm(`Delete ${title}? This can’t be undone.`)) return;
            start(async () => setError((await deleteYearAction(id)).error ?? ''));
          }}><Icon name="trash" /></button>
        )}
      </span>
      {error && <span className="err" role="alert" style={{ color: 'var(--color-bad)', fontSize: 12, whiteSpace: 'normal' }}>{error}</span>}
    </span>
  );
}
