'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { ActionButton } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { deleteYearAction, setCurrentAction } from './actions';

export function YearRowActions({ id, title, isCurrent }: { id: number; title: string; isCurrent: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {!isCurrent && <button className="ra-link" disabled={pending} onClick={() => start(() => setCurrentAction(id))}>Make current</button>}
      <Link className="ra-link" href={`/admin/settings/years/${id}/calendar`}>Calendar</Link>
      <span className="ra-acts">
        <Link href={`/admin/settings/years/${id}`} aria-label={`Edit ${title}`}><Icon name="edit" /></Link>
        {!isCurrent && (
          <ActionButton className="" ariaLabel={`Delete ${title}`} action={deleteYearAction.bind(null, id)} confirm={`Delete ${title}?`}
            lose="Its holidays go with it. This can’t be undone."><Icon name="trash" /></ActionButton>
        )}
      </span>
    </span>
  );
}
