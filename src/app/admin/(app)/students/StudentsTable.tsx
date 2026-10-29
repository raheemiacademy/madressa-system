'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/components/Chip';
import { Empty } from '@/components/Empty';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { RowActions, type RowAction } from '@/components/RowMenu';
import { bulkAction, deleteStudentsAction } from './actions';

type Row = { id: number; name: string; gender: string; classes: string | null; age: number | null; yearGroup: string | null; status: string; hasMedical: boolean };

type Sort = { key: string; dir: 'asc' | 'desc'; hrefs: Record<string, string> };

export function StudentsTable({ rows, classes, statuses, canEdit, canDelete, canFees, filtered, sort }: {
  rows: Row[]; classes: { value: string; label: string }[]; statuses: string[]; canEdit: boolean; canDelete: boolean; canFees: boolean; filtered: boolean; sort: Sort;
}) {
  const [sel, setSel] = useState<number[]>([]);
  const [action, setAction] = useState('accept');
  const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const hidden = sel.map((id) => <input key={id} type="hidden" name="ids" value={id} />);
  return (
    <>
      {rows.length === 0 ? (filtered ? <p className="ra-empty">Nothing matches these filters.</p>
        : <Empty icon="users" href={canEdit ? '/admin/students/new' : undefined} action="Add student">No students yet. Add them one by one, or bring in a spreadsheet with Import.</Empty>) : (
        <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 620 }}>
          <table className="ra-table">
            <thead><tr>
              {canEdit && <th><input type="checkbox" aria-label="Select all students on this page" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} /></th>}
              {th(sort, 'id', 'ID')}{th(sort, 'name', 'Name')}{th(sort, 'gender', 'Gender', 'opt')}{th(sort, 'class', 'Class')}{th(sort, 'age', 'Age', 'num opt')}{th(sort, 'status', 'Status')}<th><span className="sr-only">Actions</span></th>
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
                  <td><RowActions name={r.name} actions={([
                    canEdit && { href: `/admin/students/${r.id}/edit`, label: 'Edit', aria: `Edit ${r.name}`, icon: 'edit' },
                    { href: `/admin/students/${r.id}`, label: 'Profile', aria: `Profile of ${r.name}`, icon: 'eye' },
                    { href: `/admin/students/${r.id}/history`, label: 'Class history', aria: `Class history of ${r.name}`, icon: 'clock' },
                    { href: `/admin/register/student/${r.id}`, label: 'Register', aria: `Register of ${r.name}`, icon: 'check' },
                    { href: `/admin/incidents?student=${r.id}`, label: 'Incidents', aria: `Incidents of ${r.name}`, icon: 'alert' },
                    canFees && { href: `/admin/fees/student/${r.id}`, label: 'Fees', aria: `Fees of ${r.name}`, icon: 'pound' },
                    canFees && { href: `/admin/fees/student/${r.id}?view=history`, label: 'Fees history', aria: `Fees history of ${r.name}`, icon: 'receipt' }
                  ] as (RowAction | false)[]).filter((a): a is RowAction => !!a)} /></td>
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
              {action === 'status' && <><SelectField name="status" label="Status" options={statuses.map((s) => ({ value: s, label: s }))} /><TextField name="leftDate" label="Left date" type="date" help="Filled with today for leaving statuses if blank." /><Check name="deleteRegister" label="If leaving: delete register entries after the left date" /><Check name="sendLeftEmail" label="If leaving: send the “student left” email" />{canFees && <Check name="deleteInvoices" label="If leaving: delete unpaid invoices after the left date" />}</>}
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

/** A column heading that sorts the list by that column; pressing it again reverses the order. */
function th(sort: Sort, key: string, label: string, className?: string) {
  const on = sort.key === key;
  return (
    <th className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link className="ra-sort" href={sort.hrefs[key]!} scroll={false}>{label}<span aria-hidden="true">{on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span></Link>
    </th>
  );
}
