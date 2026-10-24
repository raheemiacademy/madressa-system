'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/components/Chip';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { bulkAction, deleteStudentsAction } from './actions';

type Row = { id: number; name: string; gender: string; classes: string | null; age: number | null; yearGroup: string | null; status: string; hasMedical: boolean };

export function StudentsTable({ rows, classes, statuses, canEdit, canDelete, canFees, filtered }: {
  rows: Row[]; classes: { value: string; label: string }[]; statuses: string[]; canEdit: boolean; canDelete: boolean; canFees: boolean; filtered: boolean;
}) {
  const [sel, setSel] = useState<number[]>([]);
  const [action, setAction] = useState('accept');
  const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const hidden = sel.map((id) => <input key={id} type="hidden" name="ids" value={id} />);
  return (
    <>
      {rows.length === 0 ? <p className="ra-empty">{filtered ? 'Nothing matches these filters.' : 'No students yet. Add one, or import a CSV.'}</p> : (
        <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 620 }}>
          <table className="ra-table">
            <thead><tr>
              {canEdit && <th><input type="checkbox" aria-label="Select all students on this page" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} /></th>}
              <th>ID</th><th>Name</th><th className="opt">Gender</th><th>Class</th><th className="num opt">Age</th><th>Status</th><th><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {canEdit && <td><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></td>}
                  <td className="ra-muted">{r.id}</td>
                  <td className="wrap"><Link href={`/admin/students/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.name}</Link>{r.hasMedical && <> <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-bad)' }}><span>Medical</span></span></>}</td>
                  <td className="opt">{r.gender === 'Unspecified' ? '' : r.gender}</td>
                  <td className="wrap">{r.classes ?? <span className="ra-muted">No class</span>}</td>
                  <td className="num opt" title={r.yearGroup ?? undefined}>{r.age ?? ''}</td>
                  <td><Chip>{r.status}</Chip></td>
                  <td><span className="ra-acts">
                    {canEdit && <Link href={`/admin/students/${r.id}/edit`} aria-label={`Edit ${r.name}`}><Icon name="edit" /></Link>}
                    <Link href={`/admin/students/${r.id}`} aria-label={`Profile of ${r.name}`}><Icon name="eye" /></Link>
                    <Link href={`/admin/students/${r.id}/history`} aria-label={`Class history of ${r.name}`}><Icon name="clock" /></Link>
                    <Link href={`/admin/register/student/${r.id}`} aria-label={`Register of ${r.name}`}><Icon name="check" /></Link>
                    {canFees && <Link href={`/admin/fees/student/${r.id}`} aria-label={`Fees of ${r.name}`}><Icon name="pound" /></Link>}
                    {canFees && <Link href={`/admin/fees/student/${r.id}?view=history`} aria-label={`Fees history of ${r.name}`}><Icon name="receipt" /></Link>}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && sel.length > 0 && (
        <section aria-label="Bulk actions" className="ra-card" style={{ background: 'var(--ra-tint)' }}>
          <Form action={bulkAction} card={false} savebar={false} submit={`Apply to ${sel.length === 1 ? '1 student' : `${sel.length} students`}`}>
            {hidden}
            <div className="ra-fields">
              <SelectField name="action" label={`With ${sel.length === 1 ? '1 selected student' : `${sel.length} selected students`}`} value={action} onChange={(e) => setAction(e.target.value)}
                options={[{ value: 'accept', label: 'Move to Accepted' }, { value: 'activate', label: 'Move to a class and activate' }, { value: 'reject', label: 'Move to Rejected' }, { value: 'status', label: 'Set status and left date' }, ...(canFees ? [{ value: 'admission', label: 'Create admission fees' }] : [])]} />
              {action === 'activate' && <><SelectField name="classId" label="Class" options={[{ value: '', label: 'Choose a class' }, ...classes]} /><TextField name="date" label="Start date" type="date" /></>}
              {action === 'status' && <><SelectField name="status" label="Status" options={statuses.map((s) => ({ value: s, label: s }))} /><TextField name="leftDate" label="Left date" type="date" help="Filled with today for leaving statuses if blank." /><Check name="deleteRegister" label="If leaving: delete register entries after the left date" />{canFees && <Check name="deleteInvoices" label="If leaving: delete unpaid invoices after the left date" />}</>}
            </div>
          </Form>
          {canDelete && (
            <details style={{ marginTop: 12 }}>
              <summary className="ra-link" style={{ display: 'inline-grid', color: 'var(--color-bad)' }}>Permanently delete the selected students</summary>
              <Form action={deleteStudentsAction} card={false} savebar={false} submit="Delete permanently">
                {hidden}
                <p className="ra-note" style={{ margin: 0 }}>This removes their records, contacts links, class history and notes for good. Type the school name to confirm.</p>
                <TextField name="confirmName" label="School name" autoComplete="off" />
              </Form>
            </details>
          )}
        </section>
      )}
    </>
  );
}
