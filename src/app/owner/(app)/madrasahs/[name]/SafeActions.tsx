'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminLinkAction, requestActionAction, saveMadrasahNoteAction } from '../../../actions';
import { Icon } from '../../../_ui/icons';
import { Sheet, useToast } from '../../../_ui/Sheet';

type Sheet = null | 'link' | 'restart' | 'backup';
const failed = 'That didn’t work. Check your connection and try again.';

/** One madrasah → Safe actions: each asks first, and is recorded in the audit log. */
export function SafeActions({ name, admins, lastBackup, status }: { name: string; admins: { name: string; email: string }[]; lastBackup: string; status: { restart: string | null; backup: string | null } }) {
  const router = useRouter();
  const { toast, toastBox } = useToast();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [who, setWho] = useState(admins[0]?.email ?? '');
  const [link, setLink] = useState<{ for: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const close = () => { setSheet(null); setLink(null); setError(''); };

  const queue = async (action: 'restart' | 'backup') => {
    setBusy(true);
    const r = await requestActionAction(name, action).catch(() => ({ ok: false as const, error: failed }));
    setBusy(false); close();
    if (!r.ok) return toast(r.error);
    toast(r.already ? `Already waiting for the server: ${action === 'restart' ? 'restart' : 'backup'} of ${name}.` : `${action === 'restart' ? 'Restart' : 'Backup'} queued for ${name}.`);
    router.refresh();
  };
  const makeLink = async () => {
    setBusy(true); setError('');
    const r = await adminLinkAction(name, who).catch(() => ({ ok: false as const, error: failed }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLink({ for: admins.find((a) => a.email === who)?.name ?? who, url: r.link });
  };
  const copy = () => link && navigator.clipboard?.writeText(link.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => toast('Press Ctrl+C or Cmd+C to copy'));

  return (
    <>
      <div className="actions">
        <div className="action"><div><b>Set-password link</b><small>For a locked-out admin. Also logged in this madrasah’s audit log.</small></div>
          <button className="btn" type="button" onClick={() => setSheet('link')} disabled={!admins.length}>Get link</button></div>
        <div className="action"><div><b>Restart</b><small>Unavailable for about 30 seconds.</small>{status.restart && <small>{status.restart}</small>}</div>
          <button className="btn" type="button" onClick={() => setSheet('restart')}>Restart</button></div>
        <div className="action"><div><b>Back up now</b><small>Runs within a minute. Last: {lastBackup}.</small>{status.backup && <small>{status.backup}</small>}</div>
          <button className="btn" type="button" onClick={() => setSheet('backup')}>Back up</button></div>
      </div>
      {sheet === 'restart' && (
        <Sheet title={`Restart ${name}?`} onClose={close}>
          <p>It will be unavailable for about 30 seconds. The server picks this up within a minute. It’s recorded in the audit log.</p>
          <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
            <button className="btn primary" type="button" onClick={() => queue('restart')} disabled={busy} data-autofocus>Restart</button></div>
        </Sheet>
      )}
      {sheet === 'backup' && (
        <Sheet title={`Back up ${name} now?`} onClose={close}>
          <p>A backup starts within a minute. You’ll see it on the Server page when it’s done. It’s recorded in the audit log.</p>
          <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
            <button className="btn primary" type="button" onClick={() => queue('backup')} disabled={busy} data-autofocus>Back up now</button></div>
        </Sheet>
      )}
      {sheet === 'link' && !link && (
        <Sheet title="Set-password link for…" onClose={close}>
          <label className="field"><span>Admin</span>
            <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>
              {admins.map((a) => <option key={a.email} value={a.email}>{a.name} · {a.email}</option>)}
            </select>
          </label>
          <p className="note">The link is made by {name} itself and logged in its audit log and yours. Send it to the admin privately.</p>
          <p className="err" role="alert">{error}</p>
          <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
            <button className="btn primary" type="button" onClick={makeLink} disabled={busy} data-autofocus>{busy ? 'Making…' : 'Make link'}</button></div>
        </Sheet>
      )}
      {sheet === 'link' && link && (
        <Sheet title={`Link for ${link.for}`} onClose={close}>
          <p className="note">Copy it and send it to them privately, for example on WhatsApp. It works once, for 48 hours.</p>
          <div className="cmd"><code>{link.url}</code><button className="btn sm" type="button" onClick={copy} data-autofocus><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button></div>
          <div className="btn-row"><button className="btn primary" type="button" onClick={close}>Done</button></div>
        </Sheet>
      )}
      {toastBox}
    </>
  );
}

/** One madrasah → Your notes: saved a second after you stop typing, and when you leave the box. */
export function MadrasahNotes({ name, initial }: { name: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState<'' | 'Saving…' | 'Saved' | 'Not saved'>('');
  const last = useRef(initial), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async (text: string) => {
    clearTimeout(timer.current);
    if (text === last.current) return;
    setSaved('Saving…');
    const r = await saveMadrasahNoteAction(name, text).catch(() => ({ ok: false as const, error: failed }));
    if (r.ok) { last.current = text; setSaved('Saved'); } else setSaved('Not saved');
  };
  return (
    <>
      <div className="card-h"><h2 id="h-notes">Your notes</h2><p className="note" aria-live="polite">{saved}</p></div>
      <label className="vh" htmlFor="notes">Notes about {name}</label>
      <textarea className="textarea" id="notes" value={notes} maxLength={5000} placeholder="For example, Imam prefers WhatsApp…"
        onChange={(e) => { const v = e.target.value; setNotes(v); setSaved(''); clearTimeout(timer.current); timer.current = setTimeout(() => save(v), 1000); }}
        onBlur={(e) => save(e.target.value)} />
    </>
  );
}
