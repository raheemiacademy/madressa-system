import { db } from '@/db';
import { TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listKiosks } from '@/server/attendance/teacher-logs';
import { revokeKioskAction, setUpKioskAction } from '../actions';

export const metadata = { title: 'Kiosk devices' };

export default async function Kiosks() {
  const admin = await requireAdmin();
  const devices = await listKiosks(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Kiosk devices</h1><p>A kiosk is a school tablet where teachers sign in and out with their PIN. Only devices set up here can open the kiosk page.</p></div></div>
      <section className="ra-card">
        {devices.length === 0 ? <p className="ra-empty">No kiosk devices yet.</p> : (
          <table className="ra-table"><thead><tr><th>Device</th><th>Set up</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{devices.map((d) => (
              <tr key={d.id}><td className="wrap">{d.name}</td><td>{formatInstant(d.createdAt, 'dd/MM/yyyy')}</td>
                <td>{adminCan(admin.staff, 'super') && <ActionButton className="ra-link" action={revokeKioskAction.bind(null, d.id)} label="Remove" confirm={`Stop ${d.name} working as a kiosk?`} danger />}</td></tr>
            ))}</tbody></table>
        )}
      </section>
      {adminCan(admin.staff, 'super') && (
        <Form action={setUpKioskAction} submit="Set up this browser as a kiosk">
          <div className="ra-card-h"><div><h2>Set up this device</h2><div className="ra-note">Do this on the kiosk tablet itself, signed in as a super admin. Then open <b>/kiosk</b> on it and sign out of the admin area.</div></div></div>
          <TextField name="name" label="Device name" placeholder="Front desk tablet" />
        </Form>
      )}
    </div>
  );
}
