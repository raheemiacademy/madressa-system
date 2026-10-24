import Link from 'next/link';
import { db } from '@/db';
import { CopyButton } from '@/app/_portal/Copy';
import { Chip } from '@/components/Chip';
import { ActionButton } from '@/components/Form';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { setupProgress } from '@/server/onboarding';
import { feedToken, systemStatus } from '@/server/ops/system';
import { hideChecklistAction } from '../../onboarding-actions';
import { appUrl } from '@/server/password-links';
import { resetFeedAction } from '../actions';
import { OpsNav } from '../OpsNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'System' };

/** §3 System page: version, automation status, mail, storage, the setup checklist and the calendar feed. */
export default async function System() {
  await requireAdmin('super');
  const [s, token, setup] = await Promise.all([systemStatus(db), feedToken(db), setupProgress(db)]);
  const feed = `${appUrl()}/calendar/${token}.ics`;
  const done = s.checklist.filter((c) => c.done).length;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>System</h1><p>Version {s.version} ({s.commit}) · <Link href="/admin/whats-new">What’s new</Link> · how the background services are doing</p></div></div>
      <OpsNav current="/admin/tools/system" />
      <div className="ra-kpis">
        <div className="ra-kpi" style={{ ['--c' as string]: s.worker.running ? 'var(--color-ok)' : 'var(--color-bad)' }}>
          <div className="ra-kpi-top">Automation services</div>
          <div className="ra-kpi-val" style={{ fontSize: 22 }}>{s.worker.running ? 'Running' : 'Stopped'}</div>
          <div className="ra-kpi-sub">{s.worker.lastBeat ? `Last checked in ${formatInstant(s.worker.lastBeat, 'dd/MM/yyyy HH:mm:ss')}` : 'Has never run'}{s.lastDaily ? ` · daily jobs ran ${formatCalendarDate(s.lastDaily)}` : ''}</div>
        </div>
        <div className="ra-kpi" style={{ ['--c' as string]: s.mail.failed ? 'var(--color-bad)' : 'var(--ra-blue)' }}>
          <div className="ra-kpi-top">Mail queue</div>
          <div className="ra-kpi-val" style={{ fontSize: 22 }}>{s.mail.queued} waiting</div>
          <div className="ra-kpi-sub">{s.mail.failed === 1 ? '1 failed' : `${s.mail.failed} failed`} · {s.mail.driver} · <Link href="/admin/settings/mail-queue">Mail queue</Link></div>
        </div>
        <div className="ra-kpi" style={{ ['--c' as string]: 'var(--ra-violet)' }}>
          <div className="ra-kpi-top">Last backup</div>
          <div className="ra-kpi-val" style={{ fontSize: 22 }}>{s.lastBackup ? formatInstant(s.lastBackup.createdAt, 'dd/MM/yyyy') : 'None yet'}</div>
          <div className="ra-kpi-sub">{s.lastBackup ? `${s.lastBackup.kind === 'nightly' ? 'Nightly' : 'Made by hand'} · ${formatInstant(s.lastBackup.createdAt, 'HH:mm')}` : 'Make one under Backups'}</div>
        </div>
      </div>
      <div className="ra-grid">
        <section className="ra-card ra-c6" aria-labelledby="chk-h">
          <div className="ra-card-h"><div><h2 id="chk-h">Go-live checklist</h2><div className="ra-note">{done} of {s.checklist.length} done</div></div></div>
          {setup.hidden && <div className="ra-toolbar" style={{ marginBottom: 10 }}><ActionButton action={hideChecklistAction.bind(null, false)} label="Show the setup steps on the dashboard" /></div>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {s.checklist.map((c) => <li key={c.label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Chip colour={c.done ? 'var(--color-ok)' : 'var(--color-warn)'}>{c.done ? 'Done' : 'To do'}</Chip><Link href={c.href}>{c.label}</Link></li>)}
          </ul>
        </section>
        <section className="ra-card ra-c6" aria-labelledby="svc-h">
          <div className="ra-card-h"><div><h2 id="svc-h">Services</h2></div></div>
          <dl className="ra-dl">
            <dt>Email</dt><dd>{s.mail.driver}</dd>
            <dt>Text messages</dt><dd>{s.sms}</dd>
            <dt>Files and backups</dt><dd>{s.storage}</dd>
            <dt>Theme</dt><dd><Link href="/admin/settings/preferences">Header and menu theme</Link></dd>
          </dl>
        </section>
        <section className="ra-card ra-c12" aria-labelledby="ics-h">
          <div className="ra-card-h"><div><h2 id="ics-h">Calendar feed</h2><div className="ra-note">Holidays shown to parents and active events. Subscribe to this address in Google, Apple or Outlook calendar. Anyone with it can see the calendar, so share it with care.</div></div></div>
          <p style={{ margin: '0 0 10px', overflowWrap: 'anywhere' }}><code>{feed}</code></p>
          <div className="ra-toolbar"><CopyButton text={feed} label="Copy address" /><ActionButton action={resetFeedAction} label="Make a new address" confirm="Make a new address? The old one stops working straight away." /></div>
        </section>
      </div>
    </div>
  );
}
