'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { removePushAction, savePushAction } from './push-actions';

type State = 'loading' | 'on' | 'off' | 'denied' | 'install' | 'unsupported';
const DISMISS = 'ra_push_card';

const keyBytes = (b64: string) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhones and iPads only allow notifications for apps added to the home screen.
const needsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;

/**
 * "Phone notifications" for the parent and teacher apps: a row on More (all states) or a card on Home (only while it's off,
 * until dismissed). Turning it on asks the phone's permission, then saves this device's push address.
 */
export function PushToggle({ portal, publicKey, variant }: { portal: 'parent' | 'teacher'; publicKey: string; variant: 'row' | 'card' }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    (async () => {
      try { if (variant === 'card' && localStorage.getItem(DISMISS) === 'no') setHidden(true); } catch { /* fine */ }
      if (!supported()) return setState(needsInstall() ? 'install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [variant]);

  const turnOn = async () => {
    setBusy(true); setError('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const r = await savePushAction(portal, sub.toJSON());
      if (r.error) { setError(r.error); await sub.unsubscribe(); return; }
      setState('on');
    } catch { setError('Notifications couldn’t be turned on on this device.'); } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await removePushAction(portal, sub.endpoint); await sub.unsubscribe(); }
      setState('off');
    } finally { setBusy(false); }
  };
  const what = portal === 'parent' ? 'messages, homework and replies from the school' : 'new messages';

  if (variant === 'card') {
    if (hidden || state !== 'off') return null;
    return (
      <section className="ra-card rp-push-card" aria-label="Phone notifications">
        <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-accent)' }}><Icon name="bell" /></span>
        <div><b>Get notified</b><small>A notification on this phone for {what}.</small>{error && <small role="alert" style={{ color: 'var(--color-bad)' }}>{error}</small>}</div>
        <div className="rp-push-acts">
          <button type="button" className="ra-btn primary tap" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</button>
          <button type="button" className="ra-link" onClick={() => { setHidden(true); try { localStorage.setItem(DISMISS, 'no'); } catch { /* fine */ } }}>Not now</button>
        </div>
      </section>
    );
  }
  const note = { loading: '', on: `You’ll get a notification for ${what}.`, off: `Get a notification on this device for ${what}.`,
    denied: 'Notifications are blocked for this app. Allow them in your phone’s settings, then come back here.',
    install: 'On iPhone, add this app to your Home Screen first (Share, then “Add to Home Screen”), open it from there, and turn notifications on here.',
    unsupported: 'This browser can’t show notifications from the app.' }[state];
  return (
    <div className="ra-card rp-push-row">
      <span className="rp-ic" style={{ ['--c' as string]: 'var(--ra-accent)' }}><Icon name="bell" /></span>
      <div><b>Phone notifications</b><small>{note}</small>{error && <small role="alert" style={{ color: 'var(--color-bad)' }}>{error}</small>}</div>
      {state === 'on' && <button type="button" className="ra-btn tap" onClick={turnOff} disabled={busy}>Turn off</button>}
      {state === 'off' && <button type="button" className="ra-btn primary tap" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</button>}
    </div>
  );
}
