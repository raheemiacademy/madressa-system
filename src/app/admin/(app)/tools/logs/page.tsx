import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { LOG_FILTERS, listLogs } from '@/server/ops/logs';
import { deleteLogsAction } from '../actions';
import { OpsNav } from '../OpsNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logs' };
const LABEL: Record<string, string> = { all: 'All', system: 'System', parent: 'Parent', student: 'Student', teacher: 'Teacher', staff: 'Staff', contact: 'Contact', notification: 'Notification', audit: 'Audit' };
const COLOUR: Record<string, string> = { system: 'var(--ra-violet)', notification: 'var(--ra-blue)', audit: 'var(--color-fg-muted)' };

/** §3 Logs: sign-ins, background jobs and notifications, with the audit trail. Delete All Logs keeps the audit trail. */
export default async function Logs({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; page?: string }> }) {
  await requireAdmin('super');
  const sp = await searchParams;
  const r = await listLogs(db, { kind: sp.kind, q: sp.q, page: Number(sp.page) || 1 });
  const href = (o: Record<string, string | number | undefined>) => `/admin/tools/logs?${new URLSearchParams(Object.entries({ kind: r.kind, q: sp.q, ...o }).filter(([, v]) => v !== undefined && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)]))}`;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Logs</h1><p>Sign-ins, background jobs, emails and texts, and the audit trail</p></div></div>
      <OpsNav current="/admin/tools/logs" />
      <nav className="ra-filters" aria-label="Kind">{LOG_FILTERS.map((k) => <Link key={k} className="ra-filter" href={href({ kind: k, page: undefined })} aria-current={r.kind === k ? 'page' : undefined}>{LABEL[k]}</Link>)}</nav>
      <form className="ra-card ra-toolbar" role="search">
        <input type="hidden" name="kind" value={r.kind} />
        <div className="ra-field grow"><label htmlFor="log-q">Search</label><input id="log-q" className="ra-input" type="search" name="q" defaultValue={sp.q ?? ''} /></div>
        <button className="ra-btn" style={{ alignSelf: 'end' }}>Search</button>
      </form>
      <section className="ra-card" aria-label="Log lines">
        {!r.rows.length ? <p className="ra-empty">Nothing logged{sp.q ? ' matching that search' : ' yet'}.</p> : (
          <div className="ra-table-wrap" tabIndex={0} role="region" aria-label="Log lines, scrolls sideways on small screens">
            <table className="ra-table">
              <thead><tr><th>Date</th><th>Kind</th><th>What happened</th><th className="opt">Who</th></tr></thead>
              <tbody>{r.rows.map((l, i) => <tr key={i}><td>{formatInstant(l.at, 'dd/MM/yyyy HH:mm:ss')}</td><td><Chip colour={COLOUR[l.kind]}>{LABEL[l.kind] ?? l.kind}</Chip></td><td className="wrap">{l.message}</td><td className="opt wrap">{l.who ?? '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="ra-toolbar" style={{ marginTop: 8 }}>
          {r.page > 1 && <Link className="ra-btn" href={href({ page: r.page - 1 })}>Newer</Link>}
          {r.more && <Link className="ra-btn" href={href({ page: r.page + 1 })}>Older</Link>}
        </div>
      </section>
      <Form action={deleteLogsAction} submit="Delete all logs" savebar={false}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-heading)' }}>Delete all logs</h2>
        <p className="ra-note" style={{ margin: 0 }}>Sign-in, system and notification logs are deleted. The audit trail of who changed what is kept.</p>
        <TextField name="confirmName" label="Type the school name to confirm" autoComplete="off" />
      </Form>
    </div>
  );
}
