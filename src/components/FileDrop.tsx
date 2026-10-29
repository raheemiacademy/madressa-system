'use client';

import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { FormErrors } from './Fields';
import { Icon } from './Icon';

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * A file box you can drop a file on (or tap to choose). The file goes up at once to /<portal>/api/upload with a bar showing
 * the real bytes sent, then ✓, or the reason with Retry. The form sends only the file's token, as "upload:<name>"; the server
 * action's takeUploads(fd) puts the file back under `name`. Saving during an upload waits for it, then goes ahead.
 * Without `label` it's just the box, for fields that draw their own label, help and errors.
 */
export function FileDrop({ name, label, accept, help, full, id = `f-${name}`, describedBy }: {
  name: string; label?: string; accept?: string; help?: string; full?: boolean; id?: string; describedBy?: string;
}) {
  const error = useContext(FormErrors)?.[name];
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'up' | 'done' | 'fail'>('idle');
  const [sent, setSent] = useState(0);
  const [problem, setProblem] = useState('');
  const [over, setOver] = useState(false);
  const [tok, setTok] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const token = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest>(null);
  const busy = useRef(false);
  const waiting = useRef<{ submitter: HTMLElement | null } | null>(null); // a save pressed mid-upload

  // Kept in state (React would otherwise put a hidden field back to its starting value on the next render) and written
  // straight in too, for a save that goes ahead the moment the upload finishes.
  const setToken = (t: string) => { if (token.current) token.current.value = t; setTok(t); };
  const clear = () => {
    xhr.current?.abort(); busy.current = false; waiting.current = null;
    setFile(null); setState('idle'); setSent(0); setProblem(''); setToken('');
    if (input.current) input.current.value = '';
  };
  const upload = (f: File) => {
    xhr.current?.abort();
    setFile(f); setToken(''); setProblem(''); setSent(0); setState('up'); busy.current = true;
    const x = new XMLHttpRequest();
    xhr.current = x;
    x.open('POST', `/${location.pathname.split('/')[1]}/api/upload`);
    x.upload.onprogress = (e) => { if (e.lengthComputable) setSent(e.loaded / e.total); };
    const fail = (why: string) => { busy.current = false; waiting.current = null; setProblem(why); setState('fail'); };
    x.onload = () => {
      const r = (() => { try { return JSON.parse(x.responseText) as { token?: string; error?: string }; } catch { return {}; } })();
      if (x.status !== 200 || !r.token) return fail(r.error ?? 'Couldn’t upload. Please try again.');
      busy.current = false; setToken(r.token); setSent(1); setState('done');
      const w = waiting.current;
      waiting.current = null;
      if (w) box.current?.closest('form')?.requestSubmit(w.submitter as HTMLButtonElement | null);
    };
    x.onerror = () => fail('Couldn’t upload: check your connection.');
    const fd = new FormData();
    fd.append('file', f);
    x.send(fd);
  };

  // Attached during the first commit (not after paint), so a tap made while the page was still starting up, which React
  // replays straight after, still waits for the upload.
  useLayoutEffect(() => {
    const form = box.current?.closest('form');
    if (!form) return;
    const onSubmit = (e: Event) => {
      if (!busy.current) return;
      e.preventDefault(); e.stopPropagation(); // the form's own handlers never see it; it's sent again when the file is up
      waiting.current = { submitter: (e as SubmitEvent).submitter };
    };
    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', clear);
    return () => { form.removeEventListener('submit', onSubmit); form.removeEventListener('reset', clear); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear only touches refs and setters
  }, []);

  const described = [describedBy, help ? `${id}-help` : '', label && error ? `${id}-err` : '', file ? `${id}-up` : ''].filter(Boolean).join(' ') || undefined;
  const drop = (
    <>
      <div className={`ra-drop${over ? ' is-over' : ''}`} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}>
        <input ref={input} id={id} type="file" className="sr-only" accept={accept} aria-invalid={error ? true : undefined} aria-describedby={described}
          onClick={(e) => e.stopPropagation()} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) upload(f); }} />
        <Icon name="download" />
        <span><b>Drop a file here</b> or <u>choose one</u></span>
      </div>
      <input ref={token} type="hidden" name={`upload:${name}`} value={tok} readOnly />
      {file && (
        <div className="ra-up" data-state={state} id={`${id}-up`}>
          <span className="nm">{file.name} <span className="ra-note">{kb(file.size)}</span></span>
          <span className="st" role="status">
            {state === 'up' && `${Math.round(sent * 100)}%`}
            {state === 'done' && <span className="ok">✓ Uploaded</span>}
            {state === 'fail' && <><span style={{ color: 'var(--color-bad)' }}>{problem}</span> <button type="button" className="ra-link" onClick={() => upload(file)}>Retry</button></>}
            {' '}<button type="button" className="ra-link" onClick={clear} aria-label={`Remove ${file.name}`}>Remove</button>
          </span>
          <span className="ra-up-bar"><i style={{ '--p': sent } as React.CSSProperties} /></span>
        </div>
      )}
    </>
  );
  if (!label) return <div ref={box}>{drop}</div>;
  return (
    <div ref={box} className={`ra-field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {drop}
      {help && <span className="help" id={`${id}-help`}>{help}</span>}
      {error && <span className="err" id={`${id}-err`}>{error}</span>}
    </div>
  );
}
