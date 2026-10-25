'use client';

import { useRef, useState } from 'react';
import { TextArea } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import type { FormState } from '@/lib/validate';

const CHOICES = {
  'accept-authorised': { title: 'Authorise this holiday', send: 'Authorise', hint: 'The days are marked as authorised absence on the registers.', text: 'Your holiday request has been authorised.' },
  'accept-unauthorised': { title: 'Mark as unauthorised', send: 'Mark as unauthorised', hint: 'The days are marked as unauthorised absence on the registers.', text: 'We have recorded these days as an unauthorised absence.' },
  info: { title: 'Ask for more information', send: 'Send', hint: 'The request stays open until you decide.', text: '' },
  decline: { title: 'Decline this request', send: 'Decline', hint: 'Nothing is marked on the registers.', text: '' }
} as const;
type Choice = keyof typeof CHOICES;

/**
 * Two big buttons, Authorise (green) and Unauthorise (red); the less common answers are links under them. Each opens a
 * short pop-up for an optional message to the parent, then sends it.
 */
export function RespondButtons({ id, action }: { id: number; action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [done, setDone] = useState('');
  const open = (c: Choice) => { setChoice(c); setDone(''); dlg.current?.showModal(); };
  const c = choice ? CHOICES[choice] : null;
  return (
    <div className="ra-respond">
      <div className="ra-respond-main">
        <button type="button" className="ra-btn ra-go" onClick={() => open('accept-authorised')}><Icon name="check" />Authorise</button>
        <button type="button" className="ra-btn ra-stop" onClick={() => open('accept-unauthorised')}><Icon name="alert" />Unauthorise</button>
      </div>
      <p className="ra-note" style={{ margin: 0 }}>
        Or <button type="button" className="ra-link" onClick={() => open('info')}>ask for more information</button> · <button type="button" className="ra-link" onClick={() => open('decline')}>decline</button>
      </p>
      {done && <p role="status" style={{ margin: 0 }}>{done}</p>}
      <dialog ref={dlg} className="ra-dialog" aria-labelledby={`resp-h-${id}`}>
        {choice && c && (
          <>
            <div className="ra-card-h"><div><h2 id={`resp-h-${id}`}>{c.title}</h2><p className="ra-note" style={{ margin: 0 }}>{c.hint}</p></div>
              <button type="button" className="ra-icon-btn" aria-label="Close" onClick={() => dlg.current?.close()}><span aria-hidden="true">×</span></button></div>
            <Form key={choice} action={action} card={false} savebar={false} submit={c.send}
              onSuccess={(s) => { setDone(s.message ?? 'Saved.'); dlg.current?.close(); }}>
              <input type="hidden" name="action" value={choice} />
              <TextArea id={`resp-${id}`} name="response" label="Message to the parent (optional)" defaultValue={c.text} rows={3} />
            </Form>
          </>
        )}
      </dialog>
    </div>
  );
}
