'use client';

import { useId, useState, useTransition } from 'react';
import { CopyButton } from '@/app/_portal/Copy';

/** Makes a one-time set-password link the admin can copy or send on WhatsApp, so a login doesn't depend on email. */
export function LoginLinkButton({ action, name, whatsapp }: { action: () => Promise<{ error?: string; link?: string }>; name: string; whatsapp?: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const id = useId();
  return (
    <>
      <button type="button" className="ra-btn" disabled={pending} onClick={() => start(async () => { const r = await action(); setError(r.error ?? ''); setLink(r.link ?? ''); })}>
        {pending ? 'Working…' : link ? 'Make a new link' : 'Get a set-password link'}
      </button>
      {error && <span role="alert" style={{ color: 'var(--color-bad)', fontSize: 12, whiteSpace: 'normal' }}>{error}</span>}
      {link && (
        <div className="ra-field" style={{ flexBasis: '100%' }}>
          <label htmlFor={id}>Send this to {name}. It works once, for 48 hours, and any older link stops working.</label>
          <input id={id} className="ra-input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <div className="ra-toolbar">
            <CopyButton text={link} label="Copy link" />
            {whatsapp && <a className="ra-btn" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Salaam ${name}, use this link to set your password and sign in: ${link}`)}`}>Send on WhatsApp</a>}
          </div>
        </div>
      )}
    </>
  );
}
