'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addMadrasahAction, changeMadrasahAction, setupCodeAction } from '../../actions';
import { Icon } from '../../_ui/icons';
import { Sheet, useToast } from '../../_ui/Sheet';

const failed = 'That didn’t work. Check your connection and try again.';

function CopyLine({ value, label, autoFocus }: { value: string; label: string; autoFocus?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined);
  return (
    <div className="cmd"><code>{value}</code>
      <button className="btn sm" type="button" onClick={copy} aria-label={`Copy the ${label}`} data-autofocus={autoFocus || undefined}><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button></div>
  );
}

/** Madrasahs → Add a madrasah. The server sets it up within a minute or two; it then appears in the list. */
export function AddMadrasah({ host }: { host: string }) {
  const router = useRouter();
  const { toast, toastBox } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [touched, setTouched] = useState(false); // the address follows the name until it's changed by hand
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; address?: string; error?: string }>({});
  const shown = touched ? address : `${name || 'name'}.${host}`;
  const close = () => { setOpen(false); setName(''); setAddress(''); setTouched(false); setDemo(false); setErrors({}); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    const r = await addMadrasahAction({ name, address: touched ? address : '', demo }).catch(() => ({ ok: false as const, error: failed, errors: undefined }));
    setBusy(false);
    if (!r.ok) return setErrors({ ...r.errors, error: r.error });
    const added = name.trim().toLowerCase();
    close();
    toast(`Adding ${added}. It’s ready in a minute or two, and appears in the list.`);
    router.refresh();
  };

  return (
    <>
      <button className="btn primary" type="button" onClick={() => setOpen(true)}>Add madrasah</button>
      {open && (
        <Sheet title="Add a madrasah" onClose={close}>
          <form className="form" onSubmit={submit} noValidate>
            <label className="field"><span>Short name <span className="hint">lowercase letters, digits or dashes, e.g. flc</span></span>
              <input className="input" name="name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} autoComplete="off" autoCapitalize="none" spellCheck={false}
                maxLength={30} required aria-invalid={errors.name ? true : undefined} aria-describedby="add-name-err" data-autofocus /></label>
            <p className="err" id="add-name-err" role="alert">{errors.name}</p>
            <label className="field"><span>Web address <span className="hint">yours, or the free one we suggest</span></span>
              <input className="input" name="address" value={shown} onChange={(e) => { setTouched(true); setAddress(e.target.value); }} autoComplete="off" autoCapitalize="none" spellCheck={false}
                inputMode="url" maxLength={200} aria-invalid={errors.address ? true : undefined} aria-describedby="add-address-err" /></label>
            <p className="err" id="add-address-err" role="alert">{errors.address}</p>
            <fieldset className="choices">
              <legend>What kind</legend>
              <label className="choice"><input type="radio" name="kind" checked={!demo} onChange={() => setDemo(false)} />
                <span><b>A real madrasah</b><small>Empty. Its first admin sets it up with a setup code you send them.</small></span></label>
              <label className="choice"><input type="radio" name="kind" checked={demo} onChange={() => setDemo(true)} />
                <span><b>A demo</b><small>Filled with fictional sample data, to show people.</small></span></label>
            </fieldset>
            <p className="note">The server sets it up within a minute or two. Madressa’s support account is added automatically. It’s recorded in the audit log.</p>
            <p className="err" role="alert">{errors.error}</p>
            <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Add madrasah'}</button></div>
          </form>
        </Sheet>
      )}
      {toastBox}
    </>
  );
}

type Open = null | 'code' | 'suspend' | 'resume' | 'remove';

/** One madrasah → Manage: the setup code for its first admin, pause or resume, and remove. Each asks first and is logged. */
export function ManageMadrasah({ name, paused, needsSetup, pending }: { name: string; paused: boolean; needsSetup: boolean; pending: string | null }) {
  const router = useRouter();
  const { toast, toastBox } = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState<{ code: string; url: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [otp, setOtp] = useState('');
  const close = () => { setOpen(null); setError(''); setCode(null); setTyped(''); setOtp(''); };

  const showCode = async () => {
    setBusy(true); setError(''); setOpen('code');
    const r = await setupCodeAction(name).catch(() => ({ ok: false as const, error: failed }));
    setBusy(false);
    if (r.ok) setCode({ code: r.code, url: r.url }); else setError(r.error);
  };
  const change = async (action: 'suspend' | 'resume' | 'remove') => {
    setBusy(true); setError('');
    const r = await changeMadrasahAction(name, action, action === 'remove' ? { typed, code: otp } : {}).catch(() => ({ ok: false as const, error: failed }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    close();
    toast(action === 'remove' ? `Removing ${name} within a minute, after its final backup.` : `${action === 'suspend' ? 'Pausing' : 'Resuming'} ${name} within a minute.`);
    router.refresh();
  };

  return (
    <>
      <div className="actions">
        {pending && <p className="note" role="status">{pending}</p>}
        {needsSetup && <div className="action"><div><b>Setup code</b><small>For its first admin, to set it up. Stops working once they have.</small></div>
          <button className="btn" type="button" onClick={showCode}>Show code</button></div>}
        {paused
          ? <div className="action"><div><b>Resume</b><small>Starts it again, on the newest version.</small></div>
            <button className="btn primary" type="button" onClick={() => setOpen('resume')} disabled={!!pending}>Resume</button></div>
          : <div className="action"><div><b>Pause</b><small>Stops it, and visitors see a “paused” page. Nothing is deleted.</small></div>
            <button className="btn" type="button" onClick={() => setOpen('suspend')} disabled={!!pending}>Pause</button></div>}
        <div className="action"><div><b>Remove</b><small>Deletes it for good, after a final backup kept on the server.</small></div>
          <button className="btn danger" type="button" onClick={() => setOpen('remove')} disabled={!!pending}>Remove…</button></div>
      </div>

      {open === 'code' && (
        <Sheet title={`Setup code for ${name}`} onClose={close}>
          {busy ? <p className="note" role="status">Asking {name}…</p> : code ? <>
            <p className="note">Send both to its first admin privately, for example on WhatsApp. They open the link and enter the code to make their account. Looking at it is recorded in the audit log.</p>
            <CopyLine value={code.url} label="setup link" autoFocus />
            <CopyLine value={code.code} label="setup code" />
          </> : <p className="err" role="alert">{error}</p>}
          <div className="btn-row"><button className="btn primary" type="button" onClick={close}>Done</button></div>
        </Sheet>
      )}
      {open === 'suspend' && (
        <Sheet title={`Pause ${name}?`} onClose={close}>
          <p>It stops within a minute, and anyone who visits sees a page saying it’s paused. Its data and backups stay as they are, and you can resume it at any time. It’s recorded in the audit log.</p>
          <p className="err" role="alert">{error}</p>
          <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
            <button className="btn primary" type="button" onClick={() => change('suspend')} disabled={busy} data-autofocus>Pause</button></div>
        </Sheet>
      )}
      {open === 'resume' && (
        <Sheet title={`Resume ${name}?`} onClose={close}>
          <p>It starts again within a minute, on the newest version. It’s recorded in the audit log.</p>
          <p className="err" role="alert">{error}</p>
          <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
            <button className="btn primary" type="button" onClick={() => change('resume')} disabled={busy} data-autofocus>Resume</button></div>
        </Sheet>
      )}
      {open === 'remove' && (
        <Sheet title={`Remove ${name} for good?`} onClose={close}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (typed === name && /^\d{6}$/.test(otp)) change('remove'); }}>
            <p>Within a minute the server makes a final backup of its database, files and keys, then deletes the madrasah: its site, its data and its sign-ins. Nobody can use it after that.</p>
            <p className="note">The final backup is kept on the server in <code>removed/</code> until you delete it, so a mistake can still be put right from there.</p>
            <label className="field"><span>Type <b translate="no">{name}</b> to confirm</span>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} data-autofocus /></label>
            <label className="field"><span>Code from your authenticator app</span>
              <input className="input otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} /></label>
            <p className="err" role="alert">{error}</p>
            <div className="btn-row"><button className="btn" type="button" onClick={close}>Cancel</button>
              <button className="btn danger" type="submit" disabled={busy || typed !== name || !/^\d{6}$/.test(otp)}>{busy ? 'Checking…' : `Remove ${name}`}</button></div>
          </form>
        </Sheet>
      )}
      {toastBox}
    </>
  );
}
