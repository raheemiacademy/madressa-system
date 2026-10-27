'use client';

import { useEffect, useState } from 'react';
import { removeOwnerPushAction, saveAlertSettingsAction, saveOwnerPushAction } from '../../actions';
import { useToast } from '../../_ui/Sheet';

type Kind = 'down' | 'back' | 'backup' | 'server' | 'signup' | 'contact';
export type Settings = { on: Record<Kind, boolean>; email: string | null };
const TYPES: [Kind, string, string][] = [
  ['down', 'A madrasah stops responding', 'After 2 checks in a row, about 10 minutes'], ['back', 'It comes back', ''],
  ['backup', 'A backup fails or is over 26 hours old', ''], ['server', 'Disk over 85% or memory over 90%', ''],
  ['signup', 'New early-access sign-up', ''], ['contact', 'New contact message', '']
];

type PushState = 'loading' | 'on' | 'off' | 'denied' | 'install' | 'unsupported';
const keyBytes = (b64: string) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhones and iPads only allow notifications for apps added to the home screen.
const needsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
const NOTE: Record<PushState, string> = {
  loading: '', on: 'On for this browser', off: 'Off for this browser', unsupported: 'This browser can’t show notifications',
  denied: 'Blocked for this browser. Allow notifications in its settings, then come back here.',
  install: 'On iPhone, add this page to your Home Screen first, open it from there, then turn push on.'
};

/** Alerts → Settings: push for this device, which alerts to send, and the alert email. Each change saves at once. */
export function AlertSettings({ settings, publicKey }: { settings: Settings; publicKey: string }) {
  const { toast, toastBox } = useToast();
  const [push, setPush] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(settings.on);
  const [email, setEmail] = useState(settings.email ?? '');
  const [emailErr, setEmailErr] = useState('');
  useEffect(() => {
    (async () => {
      if (!supported()) return setPush(needsInstall() ? 'install' : 'unsupported');
      if (Notification.permission === 'denied') return setPush('denied');
      const reg = await navigator.serviceWorker.ready;
      setPush((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setPush('unsupported'));
  }, []);

  const togglePush = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (push === 'on') {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await removeOwnerPushAction(sub.endpoint); await sub.unsubscribe(); }
        setPush('off'); toast('Push turned off for this browser.');
        return;
      }
      if ((await Notification.requestPermission()) !== 'granted') return setPush('denied');
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const r = await saveOwnerPushAction(sub.toJSON());
      if (r.error) { await sub.unsubscribe(); toast(r.error); return; }
      setPush('on'); toast('Push turned on for this browser.');
    } catch { toast('Push couldn’t be changed on this device.'); } finally { setBusy(false); }
  };

  const save = async (next: { on: Record<Kind, boolean>; email: string }) => {
    const r = await saveAlertSettingsAction(next).catch(() => ({ ok: false as const, error: 'That didn’t save. Check your connection and try again.' }));
    if (!r.ok) { if (/email/i.test(r.error)) setEmailErr(r.error); else toast(r.error); return false; }
    setEmailErr(''); return true;
  };

  return (
    <>
      <div className="opt"><span><b>Push on this device</b><small>{NOTE[push]}</small></span>
        {(push === 'on' || push === 'off') && <button className={`btn sm${push === 'off' ? ' primary' : ''}`} type="button" onClick={togglePush} disabled={busy}>{push === 'on' ? 'Turn off' : 'Turn on'}</button>}
      </div>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="note" style={{ margin: '8px 0 2px' }}>Send me alerts when</legend>
        {TYPES.map(([k, label, hint]) => (
          <label key={k} className="opt"><span>{label}{hint && <small>{hint}</small>}</span>
            <input className="switch" type="checkbox" role="switch" checked={on[k]} onChange={async (e) => {
              const next = { ...on, [k]: e.target.checked };
              setOn(next);
              if (!(await save({ on: next, email }))) setOn(on);
            }} />
          </label>
        ))}
      </fieldset>
      <label className="field"><span>Alert email</span>
        <input className="input" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.org" value={email}
          aria-invalid={emailErr ? true : undefined} aria-describedby="alert-email-err" onChange={(e) => setEmail(e.target.value)}
          onBlur={async () => { if (email.trim() !== (settings.email ?? '') || emailErr) { if (await save({ on, email: email.trim() })) toast('Alert email saved.'); } }} />
      </label>
      <p className="err" id="alert-email-err" aria-live="polite">{emailErr}</p>
      <p className="note warn-text">Email isn’t connected to a sending service yet, so alerts only reach you by push for now.</p>
      {toastBox}
    </>
  );
}
