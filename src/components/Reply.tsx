'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { FormState } from '@/lib/validate';
import { FormErrors } from './Fields';
import { TextArea } from './Fields';
import { Icon } from './Icon';

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const HOLD = 5; // seconds of "Undo send"

/**
 * A reply box for a conversation. The message shows in the thread at once with a clock; for 5 seconds "Undo send" puts it
 * back in the box, then it's sent. If sending fails, the text goes back in the box and says so. A reply with a file is
 * sent straight away (a file can't be held safely in the page).
 */
export function Reply({ action, submit = 'Reply', me, portal = false, lockable = false, attach = false }: {
  action: Action; submit?: string; me: string; portal?: boolean; lockable?: boolean; attach?: boolean;
}) {
  const [state, act, pending] = useActionState<FormState, FormData>(action, undefined);
  const [, startTransition] = useTransition();
  const [sending, setSending] = useState<{ body: string; left: number } | null>(null);
  const [failed, setFailed] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const plane = useRef<HTMLButtonElement>(null); // its paper plane flies off when a reply is sent
  const held = useRef<FormData | null>(null); // waiting out the 5 seconds
  const sentBody = useRef<string | null>(null); // sent, waiting for the server's answer
  const latest = useRef(action);
  useEffect(() => { latest.current = action; });
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const box = () => form.current?.elements.namedItem('body') as HTMLTextAreaElement | null;

  const send = (fd: FormData) => {
    clearInterval(timer.current);
    held.current = null;
    sentBody.current = String(fd.get('body') ?? '');
    setSending((s) => s && { ...s, left: 0 });
    startTransition(() => act(fd));
  };
  // The server answered: drop the "sending" copy (the page now shows the real one), or put a failed reply back in the box.
  useEffect(() => {
    if (!state || sentBody.current === null) return;
    const body = sentBody.current;
    sentBody.current = null;
    setSending(null);
    if (state.ok) { const f = form.current?.elements.namedItem('attachment') as HTMLInputElement | null; if (f) f.value = ''; return; }
    const b = box();
    if (b && !b.value) b.value = body;
    setFailed(state.message ?? 'Not sent. Please try again.');
  }, [state]);
  // Leaving the page during the 5 seconds still sends it (only a reply not yet sent; the page's action may be re-created).
  useEffect(() => () => { clearInterval(timer.current); if (held.current) void latest.current(undefined, held.current); }, []);

  const undo = () => {
    clearInterval(timer.current);
    const b = box();
    if (b && held.current) { b.value = String(held.current.get('body') ?? ''); b.focus(); }
    held.current = null;
    setSending(null);
  };

  return (
    <>
      {sending && (
        <div className="ra-thread">
          <article className="sending" aria-label="Your reply, not sent yet" style={portal ? { display: 'grid', justifyItems: 'end', gap: 4 } : undefined}>
            <div className="ra-note ra-msg-meta"><span>{portal ? 'You' : <><b>{me}</b> · Admin</>} · <span className="ra-sending"><Icon name="clock" />{sending.left > 0 ? `Sending in ${sending.left}s` : 'Sending…'}</span>
              {sending.left > 0 && <> · <button type="button" className="ra-link" onClick={undo}>Undo send</button></>}</span></div>
            <div className="ra-bubble" style={{ whiteSpace: 'pre-wrap', maxWidth: '100%' }}>{sending.body}</div>
          </article>
        </div>
      )}
      <form ref={form} method="post" className="ra-form" noValidate encType={attach ? 'multipart/form-data' : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (sending) return;
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          const body = String(fd.get('body') ?? '').trim();
          setFailed('');
          if (!body) { startTransition(() => act(fd)); return; } // the server says what's missing
          const p = plane.current;
          if (p) { p.classList.remove('fly'); void p.offsetWidth; p.classList.add('fly'); }
          held.current = fd;
          const b = box();
          if (b) b.value = '';
          const file = fd.get('attachment');
          if (file instanceof File && file.size > 0) { setSending({ body, left: 0 }); send(fd); return; }
          setSending({ body, left: HOLD });
          let left = HOLD;
          timer.current = setInterval(() => { left -= 1; if (left > 0) setSending({ body, left }); else send(fd); }, 1000);
        }}>
        <FormErrors.Provider value={state?.ok ? undefined : state?.errors}>
          {failed && <div className="ra-banner ra-alert" role="alert"><div>Not sent: {failed} Your message is back in the box.</div></div>}
          <TextArea name="body" label="Reply" rows={4} enterKeyHint="send" />
          {attach && <div className="ra-field"><label htmlFor="r-att">Attach a file</label><input className="ra-input" id="r-att" name="attachment" type="file" style={{ paddingTop: 8 }} /></div>}
          <div className="ra-toolbar">
            <button ref={plane} className="ra-btn primary" disabled={pending || !!sending}><Icon name="send" />{submit}</button>
            {lockable && <button className="ra-btn" name="lock" value="1" disabled={pending || !!sending}>Reply &amp; lock</button>}
            <span role="status" aria-live="polite">{state?.ok && !sending ? state.message : ''}</span>
          </div>
        </FormErrors.Provider>
      </form>
    </>
  );
}
