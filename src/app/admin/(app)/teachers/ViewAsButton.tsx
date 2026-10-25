'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { viewAsTeacherAction } from './actions';

/** Super admins: opens the teacher portal as this teacher. Shows why if it can't (no portal login yet, or blocked). */
export function ViewAsButton({ id, name, label = false }: { id: number; name: string; label?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <>
      <button type="button" className={label ? 'ra-btn' : undefined} disabled={pending} aria-label={label ? undefined : `Open the teacher portal as ${name}`} data-tip={label ? undefined : 'Teacher portal'}
        onClick={() => start(async () => { const r = await viewAsTeacherAction(id); setError(r?.error ?? ''); })}>
        <Icon name="phone" />{label && (pending ? 'Opening…' : 'Open their teacher portal')}
      </button>
      {error && <span role="alert" style={{ color: 'var(--color-bad)', fontSize: 12, whiteSpace: 'normal' }}>{error}</span>}
    </>
  );
}
