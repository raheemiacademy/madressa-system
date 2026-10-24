import Link from 'next/link';
import { db } from '@/db';
import { HOLIDAY_REQUEST_STATUSES } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { SelectField, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listHolidayRequests } from '@/server/attendance/requests';
import { deleteRequestAction, editRequestAction, respondAction } from '../actions';

export const metadata = { title: 'Holiday requests' };
const COLOUR: Record<string, string> = { Pending: 'var(--ra-violet)', Accepted: 'var(--color-ok)', Declined: 'var(--color-bad)', 'Info requested': 'var(--ra-blue)' };

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  const want = (await searchParams).status;
  const status = HOLIDAY_REQUEST_STATUSES.find((s) => s === want);
  const rows = await listHolidayRequests(db, status);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Holiday requests</h1><p>Requests parents send from the portal. Accepting one marks the children absent on the registers in those dates.</p></div></div>
      <nav className="ra-filters" aria-label="Status">
        <Link className="ra-filter" href="?" aria-current={!status ? 'page' : undefined}>All</Link>
        {HOLIDAY_REQUEST_STATUSES.map((s) => <Link key={s} className="ra-filter" href={`?status=${encodeURIComponent(s)}`} aria-current={status === s ? 'page' : undefined}>{s}</Link>)}
      </nav>
      {rows.length === 0 ? <div className="ra-card"><p className="ra-empty">No holiday requests{status ? ` that are ${status.toLowerCase()}` : ''}.</p></div> : rows.map(({ r, from, students }) => (
        <article key={r.id} className="ra-card" aria-labelledby={`hr-${r.id}`}>
          <div className="ra-card-h">
            <div><h2 id={`hr-${r.id}`}>Request #{r.id}: {students.map((s) => `${s.firstName} ${s.surname}`).join(', ')}</h2>
              <div className="ra-note">From {from ?? 'a parent'} · sent {formatInstant(r.createdAt, 'dd/MM/yyyy HH:mm')} · {formatCalendarDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` to ${formatCalendarDate(r.endsOn)}` : ''}</div></div>
            <Chip colour={COLOUR[r.status]}>{r.status === 'Accepted' && r.acceptedAs ? `Accepted (${r.acceptedAs})` : r.status}</Chip>
          </div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.request}</p>
          {r.response && <p className="ra-note" style={{ margin: 0 }}>Response: {r.response}</p>}
          {canEdit && (
            <div className="ra-grid">
              <div className="ra-c7"><Form action={respondAction.bind(null, r.id)} card={false} savebar={false} submit="Send response">
                <SelectField id={`a${r.id}`} name="action" label="Response" options={[{ value: 'accept-authorised', label: 'Accept as authorised' }, { value: 'accept-unauthorised', label: 'Accept as unauthorised' }, { value: 'info', label: 'Request more information' }, { value: 'decline', label: 'Decline' }]} />
                <TextArea id={`t${r.id}`} name="response" label="Message to the parent" defaultValue={r.response ?? ''} rows={2} />
              </Form></div>
              <details className="ra-c5"><summary className="ra-link" style={{ display: 'inline-grid' }}>Edit request</summary>
                <Form action={editRequestAction.bind(null, r.id)} card={false} savebar={false} submit="Save">
                  <div className="ra-fields"><TextField id={`s${r.id}`} name="startsOn" label="From" type="date" defaultValue={r.startsOn} /><TextField id={`e${r.id}`} name="endsOn" label="To" type="date" defaultValue={r.endsOn} /></div>
                  <TextArea id={`q${r.id}`} name="request" label="Request" defaultValue={r.request} rows={2} />
                </Form>
                {adminCan(admin.staff, 'delete') && <ActionButton className="ra-link" action={deleteRequestAction.bind(null, r.id)} label="Delete request" confirm={`Delete request #${r.id}? Register entries already made stay.`} danger />}
              </details>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
