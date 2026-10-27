import { db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { duration, num } from '@/lib/owner-format';
import { vapidKeys } from '@/server/comm/push';
import { requireOwner } from '@/server/next/owner';
import { alertHistory, alertSettings } from '@/server/owner/alerts';
import { Page } from '../../_ui/parts';
import { AlertSettings } from './AlertSettings';

export const metadata = { title: 'Alerts' };

/** "Today 08:00", "Yesterday 21:40", then "Sun 25 Oct 19:12" (UK time). */
function sent(d: Date, now: Date) {
  const day = (x: Date) => formatInstant(x, 'yyyy-MM-dd');
  if (day(d) === day(now)) return `Today ${formatInstant(d, 'HH:mm')}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday ${formatInstant(d, 'HH:mm')}`;
  return formatInstant(d, 'EEE d MMM HH:mm');
}

export default async function AlertsPage() {
  await requireOwner();
  const [{ rows, total }, settings, keys] = await Promise.all([alertHistory(db), alertSettings(db), vapidKeys(db)]);
  const now = new Date();
  return (
    <Page title="Alerts">
      <div className="grid">
        <section className="card c8" aria-labelledby="h-hist">
          <div className="card-h"><h2 id="h-hist">History</h2><p className="note">One alert per problem until it clears</p></div>
          {rows.length ? <>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Alert history"><table className="t">
              <thead><tr><th scope="col">Alert</th><th scope="col">About</th><th scope="col">Sent</th><th scope="col">Cleared</th><th scope="col">Sent by</th></tr></thead>
              <tbody>{rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td><td style={{ overflowWrap: 'anywhere', maxWidth: 240 }}>{a.about}</td><td className="nw">{sent(a.sentAt, now)}</td>
                  <td>{!a.clearedAt ? <span className="status warn">Still open</span> : a.clearedAt.getTime() === a.sentAt.getTime() ? '—'
                    : `${sent(a.clearedAt, now)} · ${duration(a.clearedAt.getTime() - a.sentAt.getTime())}`}</td>
                  <td className="nw">{a.channels}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {total > rows.length && <p className="note">Showing the newest {num(rows.length)} of {num(total)}.</p>}
          </> : <div className="empty"><b>No alerts yet</b>When something goes wrong or a lead arrives, it’s listed here with when it cleared.</div>}
        </section>
        <section className="card c4" aria-labelledby="h-set">
          <div className="card-h"><h2 id="h-set">Settings</h2></div>
          <AlertSettings settings={settings} publicKey={keys.publicKey} />
        </section>
      </div>
    </Page>
  );
}
