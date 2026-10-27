import Link from 'next/link';
import { formatPence } from '@/lib/money';
import { duration, num, plural, size, whenShort } from '@/lib/owner-format';
import { normaliseNumber } from '@/server/comm/sms';
import { getOwnerState, requireOwner } from '@/server/next/owner';
import type { StoredSummary } from '@/server/owner/checks';
import { Chart } from '../../../_ui/Chart';
import { Icon } from '../../../_ui/icons';
import { NotYet, Page } from '../../../_ui/parts';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  return { title: (await params).name };
}

type Money = NonNullable<StoredSummary['money']>['month'];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const weekLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function MoneyBox({ title, m }: { title: string; m: Money }) {
  return (
    <div><h3>{title}</h3><div className="kv kv2">
      <div><small>Invoiced</small><strong className="num">{formatPence(m.invoiced)}</strong></div>
      <div><small>Collected</small><strong className="num">{formatPence(m.collected)}</strong></div>
      <div><small>Overdue</small><strong className="num">{formatPence(m.overdue)}</strong></div>
      <div><small>Families overdue</small><strong className="num">{num(m.familiesOverdue)}</strong></div>
    </div></div>
  );
}

/** One madrasah: health, usage and money (totals and counts only), and its admin users' contacts. */
export default async function MadrasahPage({ params }: { params: Promise<{ name: string }> }) {
  await requireOwner();
  const { name } = await params;
  const s = await getOwnerState(), m = s.madrasahs.find((x) => x.name === name);
  const crumb = <><Link href="/owner/madrasahs">Madrasahs</Link>{m && ` · ${m.host}`}</>;
  if (!m) return <Page title="Madrasah not found" crumb={crumb}><NotYet title="Not found">It may have been removed. <Link href="/owner/madrasahs">Back to madrasahs</Link></NotYet></Page>;

  const sm = m.summary, u = sm?.usage, weeks = sm?.weeks ?? [];
  const status = [
    ['Current', u?.byStatus.current], ['Waiting list', u?.byStatus.waiting], ['On hold', u?.byStatus.onHold], ['Left this year', u?.byStatus.leftThisYear]
  ] as const;
  const maxS = Math.max(1, ...status.map(([, v]) => v ?? 0));
  const reg = u?.registersThisWeek;
  return (
    <Page title={m.name} crumb={crumb}>
      {m.status === 'down' ? <div className="strip bad"><span className="dot" /><span className="strip-text"><b>Not responding.</b> {m.attention!.text}</span></div>
        : m.attention && <div className="strip warn"><span className="dot" /><span className="strip-text"><b>Needs a look.</b> {m.attention.text}</span></div>}
      <div className="grid">
        <section className="card c4" aria-labelledby="h-health">
          <div className="card-h"><h2 id="h-health">Health</h2>{m.status === 'down' ? <span className="status bad">Down</span>
            : m.status === 'waiting' ? <span className="status off">Not checked yet</span>
            : <span className={`status${m.status === 'missed' ? ' warn' : ''}`}>{m.startedAt ? `Up ${duration(s.now.getTime() - m.startedAt.getTime())}` : 'Up'}</span>}</div>
          <div className="kv kv2">
            <div><small>Version</small><strong>{sm?.version ?? '—'}</strong></div>
            <div><small>Last backup</small><strong>{m.backup ? whenShort(m.backup.at, s.now) : 'None yet'}</strong>{m.backup && <small>{size(m.backup.sizeBytes)}</small>}</div>
            <div><small>Memory</small><strong>{size(m.memoryBytes)}</strong></div>
            <div><small>Errors, 24 h</small><strong className={u?.errors24h ? 'bad-text' : undefined}>{num(u?.errors24h)}</strong></div>
          </div>
        </section>

        <section className="card c8" aria-labelledby="h-usage">
          <div className="card-h"><h2 id="h-usage">Usage</h2><p className="note">Counts only</p></div>
          {!sm ? <div className="empty"><b>No numbers yet</b>It hasn’t answered a check yet.</div> : <>
            <div className="kv kv4">
              <div><small>Classes</small><strong className="num">{num(u?.classes)}</strong></div>
              <div><small>Teachers / staff</small><strong className="num">{num(sm.counts.teachers)} / {num(sm.counts.staff)}</strong></div>
              <div><small>Parents with a login</small><strong className="num">{num(sm.counts.parentsWithLogin)}</strong><small>of {num(sm.counts.parents)}</small></div>
              <div><small>Logins 7 / 30 days</small><strong className="num">{num(u?.logins.last7)} / {num(u?.logins.last30)}</strong></div>
            </div>
            {u && <>
              <div className="bars" role="group" aria-label="Students by status">{status.map(([label, v]) => (
                <div key={label} className="bar-row"><span>{label}</span><span className="meter"><i style={{ width: `${((v ?? 0) / maxS) * 100}%` }} /></span><span>{num(v)}</span></div>
              ))}</div>
              <div className="bar-row"><span>Registers this week</span>
                <span className={`meter${reg!.planned && reg!.taken / reg!.planned < 0.5 ? ' warn' : ''}`}><i style={{ width: `${Math.min(100, pct(reg!.taken, reg!.planned))}%` }} /></span>
                <span>{num(reg!.taken)} of {num(reg!.planned)}</span></div>
              <p className="note">This month: {num(u.thisMonth.messages)} {plural(u.thisMonth.messages, 'message', 'messages')} · {num(u.thisMonth.homework)} homework · {num(u.thisMonth.incidents)} {plural(u.thisMonth.incidents, 'incident', 'incidents')}</p>
            </>}
            {weeks.length > 0 && <div className="trends">
              <div className="trend"><h3>Logins per week</h3><Chart vals={weeks.map((w) => w.logins)} labels={weeks.map((w) => `Week of ${weekLabel(w.start)}`)} h={72} aria={`Logins per week, last ${weeks.length} weeks: ${weeks.map((w) => w.logins).join(', ')}`} /></div>
              <div className="trend"><h3>Registers taken per week</h3><Chart vals={weeks.map((w) => w.registers)} labels={weeks.map((w) => `Week of ${weekLabel(w.start)}`)} h={72} aria={`Registers per week, last ${weeks.length} weeks: ${weeks.map((w) => w.registers).join(', ')}`} /></div>
            </div>}
          </>}
        </section>

        <section className="card c7" aria-labelledby="h-money">
          <div className="card-h"><h2 id="h-money">Money</h2><p className="note">Totals only</p></div>
          {sm?.money ? <div className="money"><MoneyBox title="This month" m={sm.money.month} /><MoneyBox title="This year" m={sm.money.year} /></div>
            : <div className="empty"><b>No numbers yet</b>It hasn’t answered a check yet.</div>}
        </section>

        <section className="card c5" aria-labelledby="h-staff">
          <div className="card-h"><h2 id="h-staff">Staff contacts</h2><p className="note">Admin users only</p></div>
          <div className="contacts">
            {sm?.admins?.length ? sm.admins.map((a, i) => {
              const wa = a.phone ? normaliseNumber(a.phone) : null;
              return (
                <div key={i} className="contact">
                  <div><b>{a.name}</b><small>{a.email} · {a.phone ?? 'no phone'} · {a.access}</small></div>
                  <div className="acts">
                    <a className="btn sm" href={`mailto:${a.email}`}><Icon name="mail" />Email</a>
                    {wa ? <a className="btn sm" href={`https://wa.me/${wa.slice(1)}`} target="_blank" rel="noopener noreferrer"><Icon name="wa" />WhatsApp</a>
                      : <button className="btn sm" type="button" disabled title="No phone number on record"><Icon name="wa" />WhatsApp</button>}
                  </div>
                </div>
              );
            }) : <div className="empty"><b>No admin users</b>{sm ? 'This madrasah has no admin accounts yet.' : 'It hasn’t answered a check yet.'}</div>}
          </div>
        </section>
      </div>
    </Page>
  );
}
