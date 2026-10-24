import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { SelectField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listHomework, storageUsage } from '@/server/learning/homework';
import { yearAndClasses } from '../students/year-classes';
import { homeworkBulkAction } from './actions';

export const metadata = { title: 'Homework' };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

export default async function Homework({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const { year, options } = await yearAndClasses();
  const state = sp.state === 'inactive' ? false : sp.state === 'all' ? undefined : true;
  const [rows, usage] = await Promise.all([listHomework(db, { yearId: year?.id, classId: Number(sp.class) || undefined, from: date(sp.from), to: date(sp.to), active: state }), storageUsage(db)]);
  const canEdit = adminCan(admin.staff, 'edit');
  const now = new Date();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Homework</h1><p>Set homework, see who has done it, and remind families</p></div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href="/admin/homework/new"><Icon name="plus" />Add homework</Link>}
          <Link className="ra-btn" href="/admin/homework/incomplete">Incomplete report</Link>
          <Link className="ra-btn" href="/admin/homework/report">Year report</Link>
          <Link className="ra-btn" href="/admin/homework/templates">Templates</Link>
        </div></div>
      <div className="ra-banners"><div className="ra-banner"><div>File storage: <b>{mb(usage.used)}</b> used of {mb(usage.limit)} · {mb(usage.free)} free. <Link className="ra-link" href="/admin/settings/storage">Storage settings</Link></div></div></div>
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field"><label htmlFor="hw-class">Class</label><select className="ra-select" id="hw-class" name="class" defaultValue={sp.class ?? ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="hw-from">Due from</label><input className="ra-input" id="hw-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="hw-to">Due to</label><input className="ra-input" id="hw-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="hw-state">Show</label><select className="ra-select" id="hw-state" name="state" defaultValue={sp.state ?? 'active'}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></div>
        <button className="ra-btn">Filter</button>
      </form>
      <section className="ra-card" aria-label="Homework">
        {rows.length === 0 ? <p className="ra-empty">No homework set yet.</p> : (
          <Form action={homeworkBulkAction} card={false} savebar={false} submit="Apply to selected">
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 640 }}><table className="ra-table">
              <thead><tr>{canEdit && <th><span className="sr-only">Select</span></th>}<th>Homework</th><th>Teacher / class</th><th className="num">Completed</th><th className="num">Files</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.h.id}>
                  {canEdit && <td><input type="checkbox" name="ids" value={r.h.id} aria-label={`Select ${r.h.title}`} /></td>}
                  <td className="wrap"><Link href={`/admin/homework/${r.h.id}`}>{r.h.title}</Link></td>
                  <td className="wrap">{r.teacherName ? `${r.teacherName} · ` : ''}{r.className}</td>
                  <td className="num">{r.completed} of {r.total}</td><td className="num">{r.files || ''}</td>
                  <td>{formatInstant(r.h.deadlineAt, 'dd/MM/yyyy HH:mm')}</td>
                  <td>{!r.h.active ? <Chip colour="var(--color-fg-muted)">Inactive</Chip> : r.h.locked ? <Chip colour="var(--ra-violet)">Locked</Chip> : r.h.deadlineAt < now ? <Chip colour="var(--ra-blue)">Past due</Chip> : <Chip colour="var(--color-ok)">Open</Chip>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {canEdit && <SelectField name="op" label="Selected homework" options={[{ value: 'activate', label: 'Activate' }, { value: 'deactivate', label: 'Deactivate' }, { value: 'lock', label: 'Lock' }, { value: 'unlock', label: 'Unlock' }, ...(adminCan(admin.staff, 'delete') ? [{ value: 'delete', label: 'Delete' }] : [])]} />}
          </Form>
        )}
      </section>
    </div>
  );
}
