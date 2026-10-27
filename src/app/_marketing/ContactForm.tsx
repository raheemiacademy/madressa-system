'use client';

import { CONTACT_TOPICS } from '@/lib/marketing';
import { d } from './bits';
import { usePostForm } from './usePostForm';

/* "Send a message" on /contact, posting to /api/contact. */
const ID = { name: 'c-name', email: 'c-email', school: 'c-school', topic: 'c-topic', message: 'c-msg' };
const OK = 'JazakAllah khair. Your message is with us and we’ll reply by email.';

export function ContactForm() {
  const { field, err, statusBox, formProps, busy } = usePostForm(ID, OK);
  return (
    <form {...formProps} className="form" data-rise style={d(1)} action="/api/contact">
      <h2 className="full form-title">Send a message</h2>
      <div className="field">
        <label htmlFor="c-name">Your name</label>
        <input {...field('name')} type="text" autoComplete="name" required data-required="Please enter your name." enterKeyHint="next" />
        {err('name')}
      </div>
      <div className="field">
        <label htmlFor="c-email">Email</label>
        <input {...field('email')} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required data-required="Please enter your email." enterKeyHint="next" />
        {err('email')}
      </div>
      <div className="field full">
        <label htmlFor="c-school">Madressa or school <span className="hint">(optional)</span></label>
        <input {...field('school')} type="text" autoComplete="organization" enterKeyHint="next" />
        {err('school')}
      </div>
      <div className="field full">
        <label htmlFor="c-topic">What’s it about?</label>
        <select {...field('topic')}>{CONTACT_TOPICS.map((o) => <option key={o}>{o}</option>)}</select>
        {err('topic')}
      </div>
      <div className="field full">
        <label htmlFor="c-msg">Message</label>
        <textarea {...field('message')} required data-required="Please write your message." />
        {err('message')}
      </div>
      {statusBox}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
