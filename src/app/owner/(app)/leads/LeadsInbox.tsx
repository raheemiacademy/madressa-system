'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '@/lib/marketing';
import { setLeadNotesAction, setLeadStatusAction } from '../../actions';
import { Icon } from '../../_ui/icons';
import { Sheet, useToast } from '../../_ui/Sheet';

const STATUSES = ['New', 'Contacted', 'Set up', 'Not interested'] as const;
type Status = (typeof STATUSES)[number];
const CHIP: Record<Status, string> = { New: 'new', Contacted: 'contacted', 'Set up': 'setup', 'Not interested': 'no' };
const nf = new Intl.NumberFormat('en-GB');

export type LeadRow = {
  id: number; kind: string; when: string; status: Status; notes: string; name: string; email: string;
  school: string | null; role: string | null; students: number | null; type: string | null; topic: string | null; message: string | null; command: string;
};

/**
 * Sign-ups and contact messages, newest first, filtered by status. On a laptop the chosen lead sits beside the list; on a
 * phone the list and a lead are separate screens (`picked` is the lead's own address).
 */
export function LeadsInbox({ leads, selectedId, picked }: { leads: LeadRow[]; selectedId: number | null; picked: boolean }) {
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [status, setStatus] = useState<Record<number, Status>>({});
  const { toast, toastBox } = useToast();
  const statusOf = (l: LeadRow) => status[l.id] ?? l.status;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, leads.filter((l) => statusOf(l) === s).length])) as Record<Status, number>;
  const shown = leads.filter((l) => filter === 'all' || statusOf(l) === filter);
  const sel = leads.find((l) => l.id === selectedId) ?? null;
  return (
    <div className={`leads-page${picked ? ' picked' : ''}`}>
      <Link className="btn sm leads-back" href="/owner/leads"><Icon name="back" />All leads</Link>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter leads">
          {(['all', ...STATUSES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : s} {nf.format(s === 'all' ? leads.length : counts[s])}</button>
          ))}
        </div>
      </div>
      <div className={`leads${picked ? ' picked' : ''}`}>
        <section className="card lead-list" aria-label="Leads">
          {shown.length ? shown.map((l) => (
            <Link key={l.id} className="lead-item" href={`/owner/leads/${l.id}`} aria-current={sel?.id === l.id ? 'true' : undefined}>
              <b>{l.school || l.name}</b><time>{l.when}</time>
              <span className="meta">{l.kind} · {l.name}</span><span className={`chip ${CHIP[statusOf(l)]}`}>{statusOf(l)}</span>
            </Link>
          )) : <div className="empty">No leads with this status.</div>}
        </section>
        <div className="lead-detail-wrap">
          {sel && <LeadDetail key={sel.id} l={sel} status={statusOf(sel)} onStatus={(s) => setStatus((m) => ({ ...m, [sel.id]: s }))} toast={toast} />}
        </div>
      </div>
      {toastBox}
    </div>
  );
}

function LeadDetail({ l, status, onStatus, toast }: { l: LeadRow; status: Status; onStatus: (s: Status) => void; toast: (t: string) => void }) {
  const router = useRouter();
  const [setup, setSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState(l.notes);
  const [saved, setSaved] = useState<'' | 'Saving…' | 'Saved' | 'Not saved'>('');
  const last = useRef(l.notes), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = async (text: string) => {
    clearTimeout(timer.current);
    if (text === last.current) return;
    setSaved('Saving…');
    const r = await setLeadNotesAction(l.id, text).catch(() => ({ ok: false as const, error: 'That didn’t save. Check your connection and try again.' }));
    if (r.ok) { last.current = text; setSaved('Saved'); } else { setSaved('Not saved'); toast(r.error); }
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const changeStatus = async (s: Status) => {
    const before = status;
    onStatus(s);
    const r = await setLeadStatusAction(l.id, s).catch(() => ({ ok: false as const, error: 'That didn’t save. Check your connection and try again.' }));
    if (r.ok) { toast(`Status set to ${s}.`); router.refresh(); } else { onStatus(before); toast(r.error); }
  };
  const copy = () => navigator.clipboard?.writeText(l.command).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => toast('Press Ctrl+C or Cmd+C to copy'));
  const rows = ([['Type', l.kind], ['School', l.school || '—'], ['Name', l.name], ['Role', l.role], ['Email', l.email], ['Students', l.students ? nf.format(l.students) : null],
    ['Kind of school', l.type], ['Topic', l.topic], ['Received', l.when]] as const).filter(([, v]) => v);
  return (
    <section className="card lead-detail" aria-labelledby="h-lead">
      <div className="card-h">
        <h2 id="h-lead" style={{ overflowWrap: 'anywhere' }}>{l.school || l.name}</h2>
        <label className="vh" htmlFor="lead-status">Status</label>
        <select className="select" id="lead-status" value={status} onChange={(e) => changeStatus(e.target.value as Status)} style={{ width: 'auto', minWidth: 160 }}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <dl>{rows.map(([k, v]) => <div key={k} className="contents"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {l.message && <div className="msg" tabIndex={0} role="region" aria-label="Message">{l.message}</div>}
      <div className="btn-row">
        <a className="btn primary" href={`mailto:${l.email}?subject=${encodeURIComponent(PRODUCT_NAME)}`}><Icon name="mail" />Reply by email</a>
        <button className="btn" type="button" disabled title="No phone number given"><Icon name="wa" />WhatsApp</button>
        <button className="btn" type="button" onClick={() => setSetup(true)}>Set up as a madrasah</button>
      </div>
      <label className="field"><span>Notes <span className="hint" aria-live="polite">{saved}</span></span>
        <textarea className="textarea" value={notes} maxLength={5000} placeholder="For example, called on Tuesday, wants a demo…"
          onChange={(e) => { const v = e.target.value; setNotes(v); setSaved(''); clearTimeout(timer.current); timer.current = setTimeout(() => save(v), 1000); }}
          onBlur={(e) => save(e.target.value)} />
      </label>
      {setup && (
        <Sheet title={`Set up ${l.school || l.name}`} onClose={() => setSetup(false)}>
          <p>Run this on the server. Nothing is created from the website.</p>
          <div className="cmd"><code>{l.command}</code><button className="btn sm" type="button" onClick={copy} data-autofocus><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button></div>
          <p className="note">When it’s running, set this lead to “Set up”.</p>
          <div className="btn-row"><button className="btn" type="button" onClick={() => setSetup(false)}>Cancel</button></div>
        </Sheet>
      )}
    </section>
  );
}
