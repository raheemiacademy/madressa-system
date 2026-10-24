import Link from 'next/link';
import { SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { initials } from '@/lib/text';
import type { FormState } from '@/lib/validate';
import type { partyInbox, partyThread } from '@/server/portal/messages';

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** A portal user's conversations (design: message list item with initials, unread dot). */
export function Inbox({ threads, base }: { threads: Awaited<ReturnType<typeof partyInbox>>; base: string }) {
  if (!threads.length) return <p className="rp-empty">No messages yet.</p>;
  return (
    <ul className="ra-msg-list ra-card" style={{ listStyle: 'none', margin: 0, padding: 6 }}>
      {threads.map((t) => (
        <li key={t.id} className="ra-msg-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <Link className="ra-msg" href={`${base}/${t.id}`} data-unread={String(t.unread)}>
            <span className="ra-avatar" aria-hidden="true">{initials(t.last?.name ?? t.subject)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="ra-msg-top"><span className="ra-msg-from">{t.last?.name ?? ''}</span></span>
              <span className="ra-msg-subj" style={{ display: 'block' }}>{t.unread && <span className="sr-only">Unread: </span>}{t.subject}</span>
              <span className="ra-msg-prev" style={{ display: 'block' }}>{t.last?.body ?? ''}</span>
            </span>
            <span className="ra-msg-side">{formatInstant(t.lastMessageAt, 'dd/MM HH:mm')}<span className="ra-dot" aria-hidden="true" /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One conversation, oldest first, with a reply box unless it's locked. */
export function Conversation({ data, fileBase, reply }: { data: NonNullable<Awaited<ReturnType<typeof partyThread>>>; fileBase: string; reply: Action }) {
  return (
    <>
      <section className="ra-card ra-thread" aria-label="Messages">
        {data.messages.map((m) => (
          <article key={m.id} aria-label={`From ${m.mine ? 'you' : m.name}`} style={{ display: 'grid', justifyItems: m.mine ? 'end' : 'start', gap: 4 }}>
            <div className="ra-note">{m.mine ? 'You' : m.office ? `${m.name} (office)` : m.name} · {m.at}</div>
            <div className="ra-bubble" style={{ whiteSpace: 'pre-wrap', maxWidth: '100%' }}>{m.body}</div>
            {m.attachmentFileId && <a href={`${fileBase}/${m.attachmentFileId}`}>Attachment</a>}
          </article>
        ))}
      </section>
      {data.thread.locked ? <p className="rp-empty">This conversation is closed. Start a new message if you need to.</p> : (
        <Form action={reply} submit="Send reply" savebar={false} resetOnSuccess><TextArea name="body" label="Reply" rows={4} enterKeyHint="send" /></Form>
      )}
    </>
  );
}

/** Start a conversation with someone the §4 routes allow. */
export function NewMessage({ recipients, action }: { recipients: { value: string; label: string }[]; action: Action }) {
  if (!recipients.length) return <p className="rp-empty">Messaging isn’t turned on for you yet.</p>;
  return (
    <Form action={action} submit="Send" savebar={false}>
      <div className="ra-fields">
        <SelectField name="to" label="To" options={[{ value: '', label: 'Choose…' }, ...recipients]} full />
        <TextField name="subject" label="Subject" full enterKeyHint="next" autoComplete="off" />
        <TextArea name="body" label="Message" rows={6} enterKeyHint="send" />
      </div>
    </Form>
  );
}
