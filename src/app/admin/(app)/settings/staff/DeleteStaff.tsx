'use client';

import { ActionButton } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { deleteStaffAction } from './actions';

export function DeleteStaff({ id, name }: { id: number; name: string }) {
  return (
    <ActionButton className="" ariaLabel={`Delete ${name}`} action={deleteStaffAction.bind(null, id)} confirm={`Delete ${name}?`}
      lose="They’ll be signed out everywhere and can no longer sign in. What they did stays in the audit log. This can’t be undone."><Icon name="trash" /></ActionButton>
  );
}
