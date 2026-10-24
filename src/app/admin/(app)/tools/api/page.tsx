import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { Checks, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { API_SCOPES, listApiKeys } from '@/server/ops/system';
import { appUrl } from '@/server/password-links';
import { createKeyAction, revokeKeyAction } from '../actions';
import { OpsNav } from '../OpsNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Developer API' };

/** §19 Developer API: read-only keys for students and contacts. A key is shown once and stored hashed. */
export default async function Api() {
  await requireAdmin('super');
  const keys = await listApiKeys(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Developer API</h1><p>Let the school’s own tools read students and contacts. Keys can only read, never change anything.</p></div></div>
      <OpsNav current="/admin/tools/api" />
      <section className="ra-card" aria-labelledby="use-h">
        <div className="ra-card-h"><div><h2 id="use-h">How to use it</h2></div></div>
        <p style={{ margin: 0 }}>Send <code>Authorization: Bearer &lt;key&gt;</code> to <code>{appUrl()}/api/v1/students</code> or <code>{appUrl()}/api/v1/contacts</code>. Add <code>?page=2</code> for the next 100. Medical notes and other sensitive details are never included.</p>
      </section>
      <Form action={createKeyAction} submit="Create key" savebar={false} resetOnSuccess>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-heading)' }}>New key</h2>
        <TextField name="name" label="What it’s for" autoComplete="off" />
        <Checks name="scopes" legend="It can read" options={API_SCOPES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} />
      </Form>
      <section className="ra-card" aria-labelledby="keys-h">
        <div className="ra-card-h"><div><h2 id="keys-h">Keys</h2></div></div>
        {!keys.length ? <p className="ra-empty">No keys yet.</p> : (
          <div className="ra-table-wrap">
            <table className="ra-table">
              <thead><tr><th>Name</th><th>Key</th><th className="opt">Can read</th><th className="opt">Last used</th><th>Status</th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="wrap">{k.name}<div className="ra-note">by {k.createdBy}, {formatInstant(k.createdAt, 'dd/MM/yyyy')}</div></td>
                    <td><code>{k.prefix}…</code></td>
                    <td className="opt">{k.scopes.join(', ')}</td>
                    <td className="opt">{k.lastUsedAt ? formatInstant(k.lastUsedAt, 'dd/MM/yyyy HH:mm') : 'Never'}</td>
                    <td>{k.revokedAt ? <Chip colour="var(--color-fg-muted)">Revoked</Chip> : <ActionButton action={revokeKeyAction.bind(null, k.id)} label="Revoke" danger confirm={`Revoke “${k.name}”? Anything using it stops working straight away.`} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
