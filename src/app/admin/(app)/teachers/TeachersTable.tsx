'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/components/Chip';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { deleteTeachersAction } from './actions';
import { ViewAsButton } from './ViewAsButton';

type Row = { id: number; name: string; status: string; email: string | null };

export function TeachersTable({ rows, canEdit, canDelete, canViewAs }: { rows: Row[]; canEdit: boolean; canDelete: boolean; canViewAs: boolean }) {
  const [sel, setSel] = useState<number[]>([]);
  if (!rows.length) return <p className="ra-empty">No teachers yet.</p>;
  const all = sel.length === rows.length;
  return (
    <>
      <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
        <thead><tr>
          {canDelete && <th className="no-print"><input type="checkbox" aria-label="Select all teachers" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} /></th>}
          <th>#</th><th>Name</th><th>Status</th><th className="no-print"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id}>
            {canDelete && <td className="no-print"><input type="checkbox" aria-label={`Select ${t.name}`} checked={sel.includes(t.id)} onChange={() => setSel(sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id])} /></td>}
            <td className="ra-muted">{t.id}</td>
            <td className="wrap"><Link href={`/admin/teachers/${t.id}`}>{t.name}</Link><div className="ra-note">{t.email ?? ''}</div></td>
            <td><Chip>{t.status}</Chip></td>
            <td className="no-print"><span className="ra-acts">
              {canEdit && <Link href={`/admin/teachers/${t.id}/edit`} aria-label={`Edit ${t.name}`} data-tip="Edit"><Icon name="edit" /></Link>}
              <Link href={`/admin/teachers/hours?teacher=${t.id}`} aria-label={`Working hours for ${t.name}`} data-tip="Working hours"><Icon name="clock" /></Link>
              <Link href={`/admin/teachers/${t.id}`} aria-label={`Profile of ${t.name}`} data-tip="Profile"><Icon name="eye" /></Link>
              {canViewAs && <ViewAsButton id={t.id} name={t.name} />}
            </span></td>
          </tr>
        ))}</tbody>
      </table></div>
      {canDelete && sel.length > 0 && (
        <Form action={deleteTeachersAction} card={false} savebar={false} submit={`Delete ${sel.length === 1 ? '1 teacher' : `${sel.length} teachers`}`}>
          {sel.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <p className="ra-note" style={{ margin: 0 }}>Deleted teachers lose their portal login. Their names stay on past records.</p>
        </Form>
      )}
    </>
  );
}
